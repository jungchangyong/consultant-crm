'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Banknote, TrendingUp, TrendingDown, PiggyBank, ShieldCheck, Users, Landmark, Gift, Briefcase, Target, MousePointerClick } from 'lucide-react';

// ─── 상수 (2026년 기준) ───────────────────────────────────
const MIN_WAGE = 10_320;
const WEEK_TO_MONTH = 365 / 7 / 12; // ≈ 4.345

const INS_PENSION = 0.0475;
const INS_HEALTH = 0.03595;
const INS_LONGTERM = 0.1314;
const INS_EMPLOY = 0.0115;
const INS_ACCIDENT = 0.0082;

const INCENTIVE = { 경증남: 350_000, 경증여: 500_000, 중증남: 700_000, 중증여: 900_000 } as const;
const OBLIGATION_RATE = 0.031;

const TAX_BASE_LIMIT = 100_000_000;
const TAX_PER_HEAD = 20_000_000;

// 무상지원금
const GRANT_PER_HEAD = 40_000_000;
const GRANT_MAX = 1_000_000_000;

// 컨설팅비 / 관리비
const CONSULTING_BASE = 10_000_000;       // 기본 1천만원
const CONSULTING_PER_HEAD = 2_000_000;    // 장애인 1명당 200만원
const CONSULTING_MIN = 30_000_000;        // 최소 3천만원
const MGMT_PER_HEAD_MONTHLY = 500_000;    // 장애인 1명당 월 50만원

// 통합고용세액공제 (2026년 점증구조, 우대 대상 기준, 만원)
const EMPLOY_CREDIT: Record<string, readonly number[]> = {
  '중소기업_수도권': [700, 1600, 1700],
  '중소기업_지방': [1000, 1900, 2000],
  '중견기업': [500, 900, 900],
  '대기업': [300, 500],
};

const MIN_INCREASE: Record<string, number> = { '중소기업': 0, '중견기업': 5, '대기업': 10 };


type Gender = '남성' | '여성' | '혼합';
type CompanySize = '중소기업' | '중견기업' | '대기업';
type Location = '수도권' | '지방';

interface Props {
  initialData?: { nonDisabled: number; minDisabled: number; severeDisabled: number; annualTax: number } | null;
}

// ─── 포맷 유틸 ──────────────────────────────────────────
const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');

function fmtWon(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(2)}억원`;
  if (abs >= 10_000) return `${sign}${fmt(abs / 10_000)}만원`;
  return `${sign}${fmt(abs)}원`;
}

function fmtEok(n: number) {
  const sign = n < 0 ? '-' : '';
  return `${sign}${(Math.abs(n) / 100_000_000).toFixed(2)}억원`;
}

// ─── 계산 함수 ──────────────────────────────────────────

/** 단시간 근로자 상시근로자 환산 비율 (조특법 시행령 기준)
 * - 풀타임 (주 40시간 이상): 1명
 * - 단시간 (월 60시간 이상, ≈주 15시간) + 시급 ≥ 최저임금 120%: 0.75명 (상용형 시간제)
 * - 단시간 (월 60시간 이상, ≈주 15시간): 0.5명
 * - 월 60시간 미만 (주 15시간 미만): 상시근로자 제외
 */
function calcFteRatio(dailyH: number, weeklyD: number, hourlyWage: number = MIN_WAGE): number {
  const weeklyH = dailyH * weeklyD;
  if (weeklyH >= 40) return 1;
  if (weeklyH >= 15) {
    return hourlyWage >= MIN_WAGE * 1.2 ? 0.75 : 0.5;
  }
  return 0;
}

function calcSevereMin(totalWorkers: number): number {
  if (totalWorkers < 100) return Math.ceil(totalWorkers * 0.15);
  if (totalWorkers < 300) return Math.ceil(totalWorkers * 0.10) + 5;
  return Math.ceil(totalWorkers * 0.05) + 20;
}

function monthlyHours(dailyH: number, weeklyD: number) {
  const weeklyH = dailyH * weeklyD;
  const weeklyPaid = weeklyH >= 15 ? weeklyH + weeklyH / 5 : weeklyH; // 주휴 = 주근로시간 ÷ 5
  return weeklyPaid * WEEK_TO_MONTH;
}

function monthlyWage(hourly: number, dailyH: number, weeklyD: number) {
  return Math.round(hourly * monthlyHours(dailyH, weeklyD));
}

function calcInsurance(wage: number) {
  const pension = Math.round(wage * INS_PENSION);
  const health = Math.round(wage * INS_HEALTH);
  const longterm = Math.round(health * INS_LONGTERM);
  const employ = Math.round(wage * INS_EMPLOY);
  const accident = Math.round(wage * INS_ACCIDENT);
  return { pension, health, longterm, employ, accident, total: pension + health + longterm + employ + accident };
}

function incPerPerson(sev: '경증' | '중증', gen: Gender, wage: number) {
  const cap = Math.round(wage * 0.6);
  if (gen === '혼합') {
    const m = Math.min(INCENTIVE[`${sev}남`], cap);
    const f = Math.min(INCENTIVE[`${sev}여`], cap);
    return Math.round((m + f) / 2);
  }
  const key = `${sev}${gen === '남성' ? '남' : '여'}` as keyof typeof INCENTIVE;
  return Math.min(INCENTIVE[key], cap);
}

/** 의무고용 차감을 경증부터 적용하여 장려금 극대화 */
function calcMonthlyIncentive(sc: number, mc: number, gen: Gender, wage: number, obligation: number) {
  const sevInc = incPerPerson('중증', gen, wage);
  const mildInc = incPerPerson('경증', gen, wage);
  const mildDeducted = Math.min(obligation, mc);
  const sevDeducted = Math.max(0, obligation - mc);
  const sevEligible = Math.max(0, sc - sevDeducted);
  const mildEligible = Math.max(0, mc - mildDeducted);
  return {
    sevInc, mildInc, sevEligible, mildEligible,
    total: sevEligible * sevInc + mildEligible * mildInc,
  };
}

function taxReduction(annualTax: number, disabledCount: number, year: number) {
  const limit = TAX_BASE_LIMIT + disabledCount * TAX_PER_HEAD;
  let rate = 0;
  if (year <= 3) rate = 1.0;
  else if (year <= 5) rate = 0.5;
  else if (year <= 10) rate = 0.3;
  return Math.round(Math.min(annualTax * rate, limit));
}

function calcGrant(disabledCount: number): number {
  return Math.min(disabledCount * GRANT_PER_HEAD, GRANT_MAX);
}

function calcConsultingFee(disabledCount: number): number {
  return Math.max(CONSULTING_MIN, CONSULTING_BASE + disabledCount * CONSULTING_PER_HEAD);
}

function calcEmployCredit(
  fteCount: number,
  companySize: CompanySize,
  location: Location,
  year: number,
): number {
  const key = companySize === '중소기업' ? `중소기업_${location}` : companySize;
  const schedule = EMPLOY_CREDIT[key];
  if (!schedule || year < 1 || year > schedule.length) return 0;

  const minInc = MIN_INCREASE[companySize] ?? 0;
  const eligible = Math.max(0, fteCount - minInc);
  return Math.round(eligible * schedule[year - 1] * 10_000);
}

interface YearRow {
  year: number;
  rateLabel: string;
  hourlyWage: number;
  monthlyCost1: number;
  annualCost: number;
  annualConsulting: number; // 컨설팅비 + 관리비
  annualIncentive: number;
  annualTax: number;
  creditEarned: number;   // 해당 연도 고용세액공제 발생액
  creditUsed: number;     // 해당 연도 실제 사용(인출)액
  creditBalance: number;  // 연말 적립 잔액
  annualGrant: number;
  annualServiceSaving: number; // 용역 절감액
  annualNet: number;
  cumulative: number;
}

function simulate(p: {
  dc: number; sc: number; mc: number;
  dh: number; wd: number; gen: Gender;
  ew: number; at: number; gr: number;
  cs: CompanySize; loc: Location;
  fte: number;
  years: number;
  includeGrant: boolean;
  sv: number; // 월 용역 절감액 (원)
}): YearRow[] {
  const rows: YearRow[] = [];
  let cum = 0;
  let creditBank = 0;
  const total = p.ew + p.dc;
  const obligation = Math.ceil(total * OBLIGATION_RATE);
  const grant = p.includeGrant ? calcGrant(p.dc) : 0;
  const consultingFee = calcConsultingFee(p.dc);
  const annualMgmt = p.dc * MGMT_PER_HEAD_MONTHLY * 12;

  for (let y = 1; y <= p.years; y++) {
    const hw = Math.floor(MIN_WAGE * Math.pow(1 + p.gr, y - 1) / 10) * 10;
    const wage = monthlyWage(hw, p.dh, p.wd);
    const ins = calcInsurance(wage);
    const cost1 = wage + ins.total;
    const annualCost = cost1 * p.dc * 12;

    const annualConsulting = (y === 1 ? consultingFee : 0) + annualMgmt;

    const inc = calcMonthlyIncentive(p.sc, p.mc, p.gen, wage, obligation);
    const annualIncentive = inc.total * 12;

    const annualTax = taxReduction(p.at, p.dc, y);
    const annualGrant = y === 1 ? grant : 0;
    const annualServiceSaving = p.sv * 12;

    // 고용세액공제: 올해 발생분은 적립만 (올해 사용 불가)
    const creditEarned = calcEmployCredit(p.fte, p.cs, p.loc, y);

    // 세액감면 후 남은 납부 세금에 대해 전년까지 적립분으로 공제
    const remainingTax = Math.max(0, p.at - annualTax); // 감면 후 남은 세금
    let creditUsed = 0;
    if (remainingTax > 0 && creditBank > 0) {
      creditUsed = Math.min(remainingTax, creditBank);
      creditBank -= creditUsed;
    }

    // 올해 발생 공제를 적립 (사용 후 적립 → 올해분은 내년부터 사용 가능)
    creditBank += creditEarned;

    const annualNet = annualIncentive + annualTax + creditUsed + annualGrant + annualServiceSaving - annualCost - annualConsulting;
    cum += annualNet;

    rows.push({
      year: y,
      rateLabel: y <= 3 ? '100%' : y <= 5 ? '50%' : '30%',
      hourlyWage: hw,
      monthlyCost1: cost1,
      annualCost,
      annualConsulting,
      annualIncentive,
      annualTax,
      creditEarned,
      creditUsed,
      creditBalance: creditBank,
      annualGrant,
      annualServiceSaving,
      annualNet,
      cumulative: cum,
    });
  }
  return rows;
}

// ─── 최적 고용 수 탐색 ──────────────────────────────────

interface OptimalPoint {
  dc: number;
  sc: number;
  mc: number;
  cumulative: number;
}

function calcMinDisabledForWorkers(nonDisabled: number): number {
  return Math.max(Math.ceil((3 * nonDisabled) / 7), 10);
}

function findOptimalCount(p: {
  dh: number; wd: number; gen: Gender;
  ew: number; at: number; gr: number;
  cs: CompanySize; loc: Location;
  years: number; includeGrant: boolean;
  sv: number;
}): {
  minPoint: OptimalPoint;
  bestPoint: OptimalPoint;
  endPoint: OptimalPoint | null;
  endLabel: string | null;
  searchEndDc: number;
} {
  const fteRatio = calcFteRatio(p.dh, p.wd);
  const minDc = calcMinDisabledForWorkers(p.ew);
  let bestPoint: OptimalPoint | null = null;
  let minPoint: OptimalPoint | null = null;
  let lastPoint: OptimalPoint | null = null;
  let deficitStartPoint: OptimalPoint | null = null;
  let deficitCounter = 0;
  let everPositive = false;
  let searchEndDc = minDc;

  const maxSearch = 500; // 브라우저 프리징 방지

  for (let dc = minDc; dc <= maxSearch; dc++) {
    const total = p.ew + dc;
    const sc = Math.max(calcSevereMin(total), Math.min(Math.ceil(dc * 0.3), dc));
    const mc = dc - sc;
    const fte = dc * fteRatio;

    const rows = simulate({
      dc, sc, mc,
      dh: p.dh, wd: p.wd, gen: p.gen,
      ew: p.ew, at: p.at, gr: p.gr,
      cs: p.cs, loc: p.loc,
      fte, years: p.years, includeGrant: p.includeGrant,
      sv: p.sv,
    });

    const cumulative = rows.length > 0 ? rows[rows.length - 1].cumulative : 0;
    const point: OptimalPoint = { dc, sc, mc, cumulative };

    if (dc === minDc) minPoint = point;
    if (!bestPoint || cumulative > bestPoint.cumulative) bestPoint = point;
    lastPoint = point;

    if (cumulative >= 0) {
      everPositive = true;
      deficitCounter = 0;
      deficitStartPoint = null;
    } else {
      if (deficitCounter === 0) deficitStartPoint = point;
      deficitCounter++;
      if (deficitCounter >= 20) {
        searchEndDc = dc;
        break;
      }
    }

    searchEndDc = dc;
  }

  let endPoint: OptimalPoint | null = null;
  let endLabel: string | null = null;

  if (everPositive && deficitStartPoint) {
    endPoint = deficitStartPoint;
    endLabel = '적자 시작';
  } else if (!everPositive) {
    endPoint = lastPoint;
    endLabel = '탐색 종료';
  }

  return { minPoint: minPoint!, bestPoint: bestPoint!, endPoint, endLabel, searchEndDc };
}

// ─── 컴포넌트 ───────────────────────────────────────────
export function CostBenefitCalculator({ initialData }: Props) {
  const [disabledCount, setDisabledCount] = useState('10');
  const [severeCount, setSevereCount] = useState('3');
  const [dailyHours, setDailyHours] = useState('4');
  const [weeklyDays, setWeeklyDays] = useState('5');
  const [gender, setGender] = useState<Gender>('혼합');
  const [existingWorkers, setExistingWorkers] = useState('5');
  const [annualTax, setAnnualTax] = useState('30000');
  const [growthRate, setGrowthRate] = useState('3.5');
  const [companySize, setCompanySize] = useState<CompanySize>('중소기업');
  const [location, setLocation] = useState<Location>('수도권');
  const [useGrant, setUseGrant] = useState(false);
  const [operationYears, setOperationYears] = useState('10');
  const [serviceCost, setServiceCost] = useState('0');
  const [serviceReduction, setServiceReduction] = useState('50');

  // 자격 계산기에서 데이터 수신
  useEffect(() => {
    if (initialData) {
      setDisabledCount(String(initialData.minDisabled));
      setExistingWorkers(String(initialData.nonDisabled));
      setSevereCount(String(initialData.severeDisabled));
      setAnnualTax(String(initialData.annualTax));
    }
  }, [initialData]);

  // 무상지원금 전환 시 운영 기간 자동 보정
  const minYears = useGrant ? 7 : 5;
  useEffect(() => {
    if ((parseInt(operationYears) || 0) < minYears) {
      setOperationYears(String(minYears));
    }
  }, [useGrant, minYears, operationYears]);

  const dh = parseInt(dailyHours);
  const wd = parseInt(weeklyDays);
  const ew = Math.max(0, parseInt(existingWorkers) || 0);
  const minDcRequired = calcMinDisabledForWorkers(ew);
  const dc = Math.max(0, parseInt(disabledCount) || 0);
  const at = (parseInt(annualTax) || 0) * 10_000;
  const gr = (parseFloat(growthRate) || 0) / 100;
  const years = Math.max(minYears, parseInt(operationYears) || minYears);

  // 중증 최소 인원 계산 (상시근로자 기준)
  const totalWorkers = ew + dc;
  const minSevere = dc > 0 ? calcSevereMin(totalWorkers) : 0;
  const sc = dc > 0 ? Math.max(minSevere, Math.min(parseInt(severeCount) || 0, dc)) : 0;

  // 비장애인 수 변경 → 장애인 수, 중증장애인 수를 항상 최소 기준으로 재설정
  const handleExistingWorkersChange = (val: string) => {
    const clamped = Math.min(500, Math.max(0, parseInt(val) || 0));
    setExistingWorkers(String(clamped));
    const newEw = clamped;
    const newMinDc = calcMinDisabledForWorkers(newEw);
    setDisabledCount(String(newMinDc));
    const newMinSevere = newMinDc > 0 ? calcSevereMin(newEw + newMinDc) : 0;
    setSevereCount(String(newMinSevere));
  };

  // 장애인 수 변경 → 중증장애인 수 보정
  const handleDisabledCountChange = (val: string) => {
    setDisabledCount(val);
    const newDc = Math.max(0, parseInt(val) || 0);
    const newMinSevere = newDc > 0 ? calcSevereMin(ew + newDc) : 0;
    if ((parseInt(severeCount) || 0) < newMinSevere) setSevereCount(String(newMinSevere));
  };
  const mc = dc - sc;

  // ── 1년차 기준 단가 ──
  const wage1 = monthlyWage(MIN_WAGE, dh, wd);
  const ins1 = calcInsurance(wage1);
  const cost1 = wage1 + ins1.total;

  const obligation = Math.ceil(totalWorkers * OBLIGATION_RATE);
  const inc1 = dc > 0 ? calcMonthlyIncentive(sc, mc, gender, wage1, obligation) : null;

  const fteRatio = calcFteRatio(dh, wd);
  const fteCount = dc * fteRatio; // 상시근로자 환산 인원

  const svCost = (parseInt(serviceCost) || 0) * 10_000;
  const svRate = Math.max(10, Math.min(100, parseInt(serviceReduction) || 50));
  const monthlyServiceSaving = Math.round(svCost * svRate / 100);

  const mCost = cost1 * dc;
  const mIncentive = inc1 ? inc1.total : 0;
  const mTaxReduction = dc > 0 ? Math.round(taxReduction(at, dc, 1) / 12) : 0;
  const grant = dc > 0 && useGrant ? calcGrant(dc) : 0;
  const creditTotal = dc > 0
    ? Array.from({ length: years }, (_, i) => calcEmployCredit(fteCount, companySize, location, i + 1)).reduce((a, b) => a + b, 0)
    : 0;
  const consultingFee = dc > 0 ? calcConsultingFee(dc) : 0;
  const mMgmt = dc * MGMT_PER_HEAD_MONTHLY;
  const mNet = mIncentive + mTaxReduction + monthlyServiceSaving - mCost - mMgmt;

  // ── 최적 고용 수 탐색 ──
  const optimal = useMemo(() =>
    findOptimalCount({ dh, wd, gen: gender, ew, at, gr, cs: companySize, loc: location, years, includeGrant: useGrant, sv: monthlyServiceSaving }),
    [dh, wd, gender, ew, at, gr, companySize, location, years, useGrant, monthlyServiceSaving]
  );
  // 바 너비 계산용
  const optBarPoints = [optimal.minPoint, optimal.bestPoint, ...(optimal.endPoint ? [optimal.endPoint] : [])];
  const optMaxAbs = Math.max(...optBarPoints.map(p => Math.abs(p.cumulative)), 1);
  const optBarPct = (cum: number) => Math.max(4, (Math.abs(cum) / optMaxAbs) * 100);

  // ── 시뮬레이션 ──
  const rows = dc > 0 ? simulate({ dc, sc, mc, dh, wd, gen: gender, ew, at, gr, cs: companySize, loc: location, fte: fteCount, years, includeGrant: useGrant, sv: monthlyServiceSaving }) : [];

  const periodSums = [
    { label: '1~3년차 (100%)', rows: rows.filter(r => r.year <= 3) },
    ...(years >= 4 ? [{ label: `4~${Math.min(years, 5)}년차 (50%)`, rows: rows.filter(r => r.year >= 4 && r.year <= 5) }] : []),
    ...(years >= 6 ? [{ label: `6~${years}년차 (30%)`, rows: rows.filter(r => r.year >= 6) }] : []),
  ].map(p => ({ label: p.label, total: p.rows.reduce((s, r) => s + r.annualNet, 0) }));
  const totalNet = rows.length > 0 ? rows[rows.length - 1].cumulative : 0;

  // 퇴직금: 운영기간 종료 후 일괄 퇴사 가정 (주 15시간 이상 근로자만)
  const lastYearWage = rows.length > 0 ? monthlyWage(rows[rows.length - 1].hourlyWage, dh, wd) : 0;
  const totalRetirement = dh * wd >= 15 ? lastYearWage * years * dc : 0;
  const totalNetAfterRetirement = totalNet - totalRetirement;

  // 통합고용세액공제 공제 대상 인원 (FTE 환산 기준)
  const creditEligible = Math.max(0, fteCount - (MIN_INCREASE[companySize] ?? 0));
  const creditKey = companySize === '중소기업' ? `중소기업_${location}` : companySize;
  const creditSchedule = EMPLOY_CREDIT[creditKey] ?? [];

  const stats = dc > 0
    ? [
        { label: '월 총 고용비용', value: fmtWon(mCost), sub: `${dc}명 × ${fmtWon(cost1)}`, icon: Users, color: 'text-red-600' },
        { label: '컨설팅비 (초기)', value: fmtWon(consultingFee), sub: `기본 1천만 + ${dc}명 × 200만 (최소 3천만)`, icon: Briefcase, color: 'text-orange-600' },
        { label: '월 관리비', value: fmtWon(mMgmt), sub: `${dc}명 × 50만원/월`, icon: Briefcase, color: 'text-orange-600' },
        { label: '월 장려금', value: fmtWon(mIncentive), sub: inc1 ? `중증 ${inc1.sevEligible}명 + 경증 ${inc1.mildEligible}명` : '', icon: PiggyBank, color: 'text-emerald-600' },
        { label: '월 세금감면 (1~3년)', value: fmtWon(mTaxReduction), sub: at > 0 ? `연 ${fmtWon(taxReduction(at, dc, 1))} ÷ 12` : '소득세 미입력', icon: ShieldCheck, color: 'text-blue-600' },
        { label: '고용세액공제 (적립총액)', value: fmtWon(creditTotal), sub: creditEligible > 0 ? `${creditSchedule.length}년간 적립, 남은 세금에 사용` : companySize !== '중소기업' ? `최소 ${MIN_INCREASE[companySize]}명 초과 필요` : fteRatio === 0 ? '주 15시간 미만 제외' : '', icon: Landmark, color: 'text-violet-600' },
        { label: '무상지원금 (일시)', value: useGrant ? fmtWon(grant) : '미수령', sub: useGrant ? `${dc}명 × 4,000만원 (한도 10억)` : `의무운영 ${minYears}년`, icon: Gift, color: useGrant ? 'text-amber-600' : 'text-muted-foreground' },
        ...(monthlyServiceSaving > 0 ? [{ label: '월 용역 절감', value: fmtWon(monthlyServiceSaving), sub: `월 ${fmtWon(svCost)} × ${svRate}% 대체`, icon: Banknote, color: 'text-teal-600' }] : []),
        { label: '월 순비용', value: fmtWon(Math.abs(mNet)), sub: mNet >= 0 ? '순이익 (무상지원금·세액공제 제외)' : '순비용 (무상지원금·세액공제 제외)', icon: mNet >= 0 ? TrendingUp : TrendingDown, color: mNet >= 0 ? 'text-emerald-600' : 'text-red-600' },
      ]
    : [];

  return (
    <div className="space-y-8">
      {/* ── 입력 ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-[family-name:var(--font-display)]">
            <Banknote className="h-4 w-4" />
            장애인 고용 비용/혜택 시뮬레이션
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cb-ew">비장애인 근로자 수</Label>
                <Input id="cb-ew" type="number" min="0" max="500" value={existingWorkers} onChange={e => handleExistingWorkersChange(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="cb-dc">장애인 수 (전체)</Label>
                  <Input id="cb-dc" type="number" min={minDcRequired} value={disabledCount} onChange={e => handleDisabledCountChange(e.target.value)} />
                  <p className="text-xs text-muted-foreground">최소 {minDcRequired}명 (비장애인 {ew}명 기준)</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cb-sc">중증장애인 수</Label>
                  <Input id="cb-sc" type="number" min={minSevere} max={dc} value={severeCount} onChange={e => setSevereCount(e.target.value)} />
                  <p className="text-xs text-muted-foreground">최소 {minSevere}명 (경증 {mc}명)</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>일 근로시간</Label>
                <Select value={dailyHours} onValueChange={v => {
                  setDailyHours(v);
                  const h = parseInt(v);
                  if (h * wd < 15) {
                    const minDays = Math.ceil(15 / h);
                    setWeeklyDays(String(minDays));
                  }
                }}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[3,4,5,6,7,8].map(h => (
                      <SelectItem key={h} value={String(h)}>{h}시간</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>주 근무일수</Label>
                <Select value={weeklyDays} onValueChange={v => {
                  setWeeklyDays(v);
                  const d = parseInt(v);
                  if (dh * d < 15) {
                    const minHours = Math.ceil(15 / d);
                    setDailyHours(String(minHours));
                  }
                }}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2,3,4,5].map(d => (
                      <SelectItem key={d} value={String(d)} disabled={dh * d < 15}>{d}일</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>성별 구성</Label>
                <Select value={gender} onValueChange={v => setGender(v as Gender)}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="남성">남성</SelectItem>
                    <SelectItem value="여성">여성</SelectItem>
                    <SelectItem value="혼합">혼합 (5:5)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>기업 규모</Label>
                  <Select value={companySize} onValueChange={v => setCompanySize(v as CompanySize)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="중소기업">중소기업</SelectItem>
                      <SelectItem value="중견기업">중견기업</SelectItem>
                      <SelectItem value="대기업">대기업</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>소재지</Label>
                  <Select value={location} onValueChange={v => setLocation(v as Location)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="수도권">수도권</SelectItem>
                      <SelectItem value="지방">지방 (비수도권)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cb-at">연간 종합소득세/법인세 (만원)</Label>
                <Input id="cb-at" type="number" min="0" max="1000000" value={annualTax} onChange={e => {
                  const v = Math.min(1000000, Math.max(0, parseInt(e.target.value) || 0));
                  setAnnualTax(String(v));
                }} placeholder="0" />
                <p className="text-xs text-muted-foreground">세액감면 계산에 사용됩니다</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cb-gr">최저임금 상승률 (%)</Label>
                <Input id="cb-gr" type="number" step="0.1" value={growthRate} onChange={e => setGrowthRate(e.target.value)} />
                <p className="text-xs text-muted-foreground">최근 5년 평균 3.44%</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>무상지원금</Label>
                  <Select value={useGrant ? 'yes' : 'no'} onValueChange={v => setUseGrant(v === 'yes')}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">수령 (의무 7년)</SelectItem>
                      <SelectItem value="no">미수령 (의무 5년)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>목표 운영 기간</Label>
                  <Select value={operationYears} onValueChange={setOperationYears}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 10 - minYears + 1 }, (_, i) => minYears + i).map(n => (
                        <SelectItem key={n} value={String(n)}>{n}년</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* ── 용역 절감 ── */}
          <div className="mt-4 border-t pt-4">
            <p className="mb-3 text-sm font-medium text-muted-foreground">기존 용역(청소 등) 비용 절감</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="cb-svc">현재 월 용역비 (만원)</Label>
                <Input id="cb-svc" type="number" min="0" max="100000" value={serviceCost} onChange={e => {
                  const v = Math.max(0, parseInt(e.target.value) || 0);
                  setServiceCost(String(v));
                }} placeholder="0" />
                <p className="text-xs text-muted-foreground">청소·경비·세탁 등 외주 용역 월 비용</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cb-svr">장애인 인력 대체 절감율 ({svRate}%)</Label>
                <Input id="cb-svr" type="range" min="10" max="100" step="10" value={serviceReduction} onChange={e => setServiceReduction(e.target.value)} className="h-9" />
                <p className="text-xs text-muted-foreground">
                  월 {fmtWon(svCost)} × {svRate}% = <strong className="text-emerald-600">{fmtWon(monthlyServiceSaving)}/월</strong> 절감
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {dc > 0 && (
        <>
          {/* ── 1인당 월 비용 상세 ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-[family-name:var(--font-display)]">1인당 월 비용 상세 (2026년 기준)</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>항목</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                    <TableHead>산출 근거</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">월 급여 (주휴 포함)</TableCell>
                    <TableCell className="text-right font-[family-name:var(--font-display)]">{fmtWon(wage1)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmt(MIN_WAGE)}원 × {monthlyHours(dh, wd).toFixed(1)}시간</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>국민연금</TableCell>
                    <TableCell className="text-right">{fmtWon(ins1.pension)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">월급 × {(INS_PENSION * 100).toFixed(2)}%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>건강보험</TableCell>
                    <TableCell className="text-right">{fmtWon(ins1.health)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">월급 × {(INS_HEALTH * 100).toFixed(3)}%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>장기요양보험</TableCell>
                    <TableCell className="text-right">{fmtWon(ins1.longterm)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">건보료 × {(INS_LONGTERM * 100).toFixed(2)}%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>고용보험</TableCell>
                    <TableCell className="text-right">{fmtWon(ins1.employ)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">월급 × {(INS_EMPLOY * 100).toFixed(2)}%</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>산재보험</TableCell>
                    <TableCell className="text-right">{fmtWon(ins1.accident)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">월급 × {(INS_ACCIDENT * 100).toFixed(2)}%</TableCell>
                  </TableRow>
                  <TableRow className="border-t-2">
                    <TableCell className="font-bold">사업주 부담 합계</TableCell>
                    <TableCell className="text-right font-[family-name:var(--font-display)] font-bold">{fmtWon(cost1)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">급여 {fmtWon(wage1)} + 보험 {fmtWon(ins1.total)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* ── 통계 카드 ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stats.map(s => (
              <Card key={s.label}>
                <CardContent className="flex items-center gap-4 p-6">
                  <div className="flex h-11 w-11 items-center justify-center border border-border">
                    <s.icon className={`h-5 w-5 ${s.color}`} />
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
                    <p className={`font-[family-name:var(--font-display)] text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.sub}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── 장려금 산출 근거 ── */}
          {inc1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-[family-name:var(--font-display)]">고용장려금 산출 근거</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-4 text-muted-foreground">
                  <div className="space-y-1">
                    <p>전체 상시근로자: <strong className="text-foreground">{totalWorkers}명</strong></p>
                    <p>의무고용 인원 (3.1%): <strong className="text-foreground">{obligation}명</strong></p>
                    <p>장려금 대상: <strong className="text-foreground">{inc1.sevEligible + inc1.mildEligible}명</strong> ({dc}명 − {obligation}명)</p>
                  </div>
                  <div className="space-y-1">
                    <p>장애인 구성: <strong className="text-foreground">중증 {sc}명 + 경증 {mc}명</strong></p>
                    <p>중증 장려금 대상: <strong className="text-foreground">{inc1.sevEligible}명</strong> × {fmtWon(inc1.sevInc)}/월</p>
                    <p>경증 장려금 대상: <strong className="text-foreground">{inc1.mildEligible}명</strong> × {fmtWon(inc1.mildInc)}/월</p>
                  </div>
                </div>
                {Math.round(wage1 * 0.6) < 700_000 && sc > 0 && (
                  <p className="text-xs text-amber-600">* 중증장애인 장려금에 월임금 60% 상한 적용됨 (상한: {fmtWon(Math.round(wage1 * 0.6))})</p>
                )}
                <div className="border border-border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">장려금 단가:</strong> 경증 남 35만·여 50만, 중증 남 70만·여 90만원/월 (월임금 60% 상한)
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    의무고용 초과분에만 장려금 지급 — 경증부터 차감하여 장려금 극대화
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── 최적 고용 수 분석 ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-[family-name:var(--font-display)]">
                <Target className="h-4 w-4" />
                최적 고용 수 분석
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                비장애인 {ew}명 기준, 장애인 {optimal.minPoint.dc}명부터 1명씩 증가 탐색
                {optimal.endPoint
                  ? ` (${optimal.searchEndDc}명에서 종료 — 20회 연속 적자)`
                  : ` (${optimal.searchEndDc}명까지 탐색 — 범위 내 흑자 유지)`}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 최저 필요인원 바 */}
              <div
                className="flex items-center gap-4 rounded-lg border-2 border-blue-200 p-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
                onClick={() => { setDisabledCount(String(optimal.minPoint.dc)); setSevereCount(String(optimal.minPoint.sc)); }}
              >
                <div className="w-28 shrink-0">
                  <p className="text-[11px] font-medium text-muted-foreground">최저 필요인원</p>
                  <p className="font-[family-name:var(--font-display)] text-xl font-bold text-blue-600">{optimal.minPoint.dc}명</p>
                  <p className="text-[11px] text-muted-foreground">중증 {optimal.minPoint.sc} + 경증 {optimal.minPoint.mc}</p>
                </div>
                <div className="flex-1 h-8 rounded bg-muted/20 overflow-hidden">
                  <div
                    className="h-full rounded bg-blue-500/80 transition-all duration-300"
                    style={{ width: `${optBarPct(optimal.minPoint.cumulative)}%` }}
                  />
                </div>
                <div className="w-28 text-right shrink-0">
                  <p className={`font-[family-name:var(--font-display)] text-lg font-bold ${optimal.minPoint.cumulative >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {optimal.minPoint.cumulative >= 0 ? '+' : ''}{fmtEok(optimal.minPoint.cumulative)}
                  </p>
                </div>
              </div>

              {/* 최적 순이익 바 */}
              <div
                className="flex items-center gap-4 rounded-lg border-2 border-emerald-200 p-4 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all"
                onClick={() => { setDisabledCount(String(optimal.bestPoint.dc)); setSevereCount(String(optimal.bestPoint.sc)); }}
              >
                <div className="w-28 shrink-0">
                  <p className="text-[11px] font-medium text-muted-foreground">최적 순이익</p>
                  <p className="font-[family-name:var(--font-display)] text-xl font-bold text-emerald-600">{optimal.bestPoint.dc}명</p>
                  <p className="text-[11px] text-muted-foreground">중증 {optimal.bestPoint.sc} + 경증 {optimal.bestPoint.mc}</p>
                </div>
                <div className="flex-1 h-8 rounded bg-muted/20 overflow-hidden">
                  <div
                    className="h-full rounded bg-emerald-500/80 transition-all duration-300"
                    style={{ width: `${optBarPct(optimal.bestPoint.cumulative)}%` }}
                  />
                </div>
                <div className="w-28 text-right shrink-0">
                  <p className={`font-[family-name:var(--font-display)] text-lg font-bold ${optimal.bestPoint.cumulative >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {optimal.bestPoint.cumulative >= 0 ? '+' : ''}{fmtEok(optimal.bestPoint.cumulative)}
                  </p>
                </div>
              </div>

              {/* 적자 시작 / 탐색 종료 바 */}
              {optimal.endPoint && optimal.endLabel && (
                <div
                  className="flex items-center gap-4 rounded-lg border-2 border-red-200 p-4 cursor-pointer hover:border-red-400 hover:bg-red-50/30 transition-all"
                  onClick={() => { setDisabledCount(String(optimal.endPoint!.dc)); setSevereCount(String(optimal.endPoint!.sc)); }}
                >
                  <div className="w-28 shrink-0">
                    <p className="text-[11px] font-medium text-muted-foreground">{optimal.endLabel}</p>
                    <p className="font-[family-name:var(--font-display)] text-xl font-bold text-red-600">{optimal.endPoint.dc}명</p>
                    <p className="text-[11px] text-muted-foreground">중증 {optimal.endPoint.sc} + 경증 {optimal.endPoint.mc}</p>
                  </div>
                  <div className="flex-1 h-8 rounded bg-muted/20 overflow-hidden">
                    <div
                      className="h-full rounded bg-red-500/80 transition-all duration-300"
                      style={{ width: `${optBarPct(optimal.endPoint.cumulative)}%` }}
                    />
                  </div>
                  <div className="w-28 text-right shrink-0">
                    <p className="font-[family-name:var(--font-display)] text-lg font-bold text-red-600">
                      {optimal.endPoint.cumulative >= 0 ? '+' : ''}{fmtEok(optimal.endPoint.cumulative)}
                    </p>
                  </div>
                </div>
              )}

              {/* 안내 */}
              <p className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
                <MousePointerClick className="h-3 w-3" />
                바 클릭 시 해당 인원으로 자동 변경
              </p>

              {/* 현재 선택이 핵심 시나리오와 다를 경우 비교 */}
              {dc !== optimal.minPoint.dc && dc !== optimal.bestPoint.dc &&
                (!optimal.endPoint || dc !== optimal.endPoint.dc) && rows.length > 0 && (
                <div className="border border-border bg-muted/50 p-3 space-y-1 text-sm">
                  <p className="font-medium text-foreground">현재 설정 비교</p>
                  <p className="text-muted-foreground">
                    현재 <strong className="text-foreground">{dc}명</strong>: {years}년 누적 <strong className={totalNet >= 0 ? 'text-emerald-600' : 'text-red-600'}>{totalNet >= 0 ? '+' : ''}{fmtEok(totalNet)}</strong>
                    {' → '}
                    최적 <strong className="text-foreground">{optimal.bestPoint.dc}명</strong>으로 변경 시 <strong className="text-emerald-600">+{fmtEok(optimal.bestPoint.cumulative - totalNet)}</strong> 추가 이익
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 통합고용세액공제 산출 근거 ── */}
          {creditEligible > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-[family-name:var(--font-display)]">통합고용세액공제 산출 근거 (조특법 29조의8)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-4 text-muted-foreground">
                  <div className="space-y-1">
                    <p>기업 규모: <strong className="text-foreground">{companySize}</strong></p>
                    <p>소재지: <strong className="text-foreground">{location}</strong></p>
                    <p>장애인 = <strong className="text-foreground">우대 대상</strong> (청년/장애인/60세+)</p>
                  </div>
                  <div className="space-y-1">
                    <p>고용 증가: <strong className="text-foreground">{dc}명</strong>
                      {fteRatio < 1 && <span> (FTE 환산: <strong className="text-foreground">{fteCount % 1 === 0 ? fteCount : fteCount.toFixed(1)}명</strong>)</span>}
                    </p>
                    {fteRatio < 1 && (
                      <p>FTE 비율: <strong className="text-foreground">{(fteRatio * 100).toFixed(0)}%</strong> (주 {dh * wd}시간, {fteRatio === 0.75 ? '상용형 시간제' : '단시간근로자'})</p>
                    )}
                    {MIN_INCREASE[companySize] > 0 && (
                      <p>최소 기준: <strong className="text-foreground">{MIN_INCREASE[companySize]}명</strong> (초과분만 공제)</p>
                    )}
                    <p>공제 대상: <strong className="text-foreground">{creditEligible % 1 === 0 ? creditEligible : creditEligible.toFixed(1)}명</strong></p>
                  </div>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>연차</TableHead>
                      <TableHead className="text-right">1인당 공제</TableHead>
                      <TableHead className="text-right">{creditEligible % 1 === 0 ? creditEligible : creditEligible.toFixed(1)}명 합계</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creditSchedule.map((amount, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{i + 1}년차</TableCell>
                        <TableCell className="text-right">{amount}만원</TableCell>
                        <TableCell className="text-right font-[family-name:var(--font-display)] font-semibold text-violet-600">
                          {fmtWon(Math.round(creditEligible * amount * 10_000))}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2">
                      <TableCell className="font-bold">{creditSchedule.length}년 합계</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-[family-name:var(--font-display)] font-bold text-violet-600">
                        {fmtWon(creditSchedule.reduce((s, a) => s + Math.round(creditEligible * a * 10_000), 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <div className="border border-border bg-muted/50 p-3 space-y-1">
                  <p className="text-xs text-muted-foreground">
                    2026년 점증구조: 고용 유지 시 2·3년차에 더 높은 공제. 감소 시 감소분만 제외.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">적립/인출 방식:</strong> 발생한 공제를 적립 후, 세액감면으로 줄이지 못한 남은 세금(납부세액 − 감면액)에 대해 인출하여 차감. 올해 발생분은 다음 해부터 사용 가능 (10년 내 이월공제)
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── {years}년 시뮬레이션 ── */}
          {rows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-[family-name:var(--font-display)]">
                  {years}년 시뮬레이션
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    (세금 : {fmtWon(at)}, 장애인 : {dc}명 고용, 지원금 : {useGrant ? '수령' : '미수령'}{monthlyServiceSaving > 0 ? `, 용역절감 : ${fmtWon(monthlyServiceSaving)}/월` : ''})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>연차</TableHead>
                        <TableHead>감면율</TableHead>
                        <TableHead className="text-right">시급</TableHead>
                        <TableHead className="text-right">연 고용비용</TableHead>
                        <TableHead className="text-right">컨설팅비</TableHead>
                        <TableHead className="text-right">세금감면</TableHead>
                        <TableHead className="text-right">공제적립</TableHead>
                        <TableHead className="text-right">공제사용</TableHead>
                        <TableHead className="text-right">잔액</TableHead>
                        <TableHead className="text-right">장려금</TableHead>
                        <TableHead className="text-right">무상지원금</TableHead>
                        {monthlyServiceSaving > 0 && <TableHead className="text-right">용역절감</TableHead>}
                        <TableHead className="text-right">연 순이익</TableHead>
                        <TableHead className="text-right">누적</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(r => (
                        <TableRow
                          key={r.year}
                          className={r.year <= 3 ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : r.year <= 5 ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}
                        >
                          <TableCell className="font-medium">{r.year}년차</TableCell>
                          <TableCell>
                            <Badge variant={r.year <= 3 ? 'default' : 'secondary'} className="text-xs">{r.rateLabel}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-xs">{fmt(r.hourlyWage)}원</TableCell>
                          <TableCell className="text-right text-red-600">{fmtEok(r.annualCost)}</TableCell>
                          <TableCell className="text-right text-orange-600">{fmtEok(r.annualConsulting)}</TableCell>
                          <TableCell className="text-right text-blue-600">{fmtEok(r.annualTax)}</TableCell>
                          <TableCell className="text-right text-violet-600">
                            {r.creditEarned > 0 ? fmtEok(r.creditEarned) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-violet-600">
                            {r.creditUsed > 0 ? fmtEok(r.creditUsed) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {r.creditBalance > 0 ? fmtEok(r.creditBalance) : '-'}
                          </TableCell>
                          <TableCell className="text-right text-emerald-600">{fmtEok(r.annualIncentive)}</TableCell>
                          <TableCell className="text-right text-amber-600">
                            {r.annualGrant > 0 ? fmtEok(r.annualGrant) : '-'}
                          </TableCell>
                          {monthlyServiceSaving > 0 && (
                            <TableCell className="text-right text-teal-600">
                              {fmtEok(r.annualServiceSaving)}
                            </TableCell>
                          )}
                          <TableCell className={`text-right font-[family-name:var(--font-display)] font-semibold ${r.annualNet >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {r.annualNet >= 0 ? '+' : ''}{fmtEok(r.annualNet)}
                          </TableCell>
                          <TableCell className={`text-right font-[family-name:var(--font-display)] font-bold ${r.cumulative >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {r.cumulative >= 0 ? '+' : ''}{fmtEok(r.cumulative)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── 구간별 요약 ── */}
          {rows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-[family-name:var(--font-display)]">구간별 요약</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {periodSums.map(p => (
                    <div key={p.label} className="border border-border p-4">
                      <p className="text-xs font-medium text-muted-foreground">{p.label}</p>
                      <p className={`font-[family-name:var(--font-display)] text-xl font-bold ${p.total >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {p.total >= 0 ? '+' : ''}{fmtEok(p.total)}
                      </p>
                    </div>
                  ))}
                  <div className="border-2 border-foreground p-4">
                    <p className="text-xs font-medium text-muted-foreground">{years}년 합계</p>
                    <p className={`font-[family-name:var(--font-display)] text-xl font-bold ${totalNet >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {totalNet >= 0 ? '+' : ''}{fmtEok(totalNet)}
                    </p>
                  </div>
                </div>

                {totalRetirement > 0 && (
                  <div className="mt-4 border-t pt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{years}년 누적 순이익</span>
                      <span className={`font-[family-name:var(--font-display)] font-semibold ${totalNet >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {totalNet >= 0 ? '+' : ''}{fmtEok(totalNet)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">퇴직금 정산 (일괄)</span>
                      <span className="font-[family-name:var(--font-display)] font-semibold text-red-600">
                        -{fmtEok(totalRetirement)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t pt-2">
                      <span className="text-sm font-bold">실질 순이익</span>
                      <span className={`font-[family-name:var(--font-display)] text-xl font-bold ${totalNetAfterRetirement >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {totalNetAfterRetirement >= 0 ? '+' : ''}{fmtEok(totalNetAfterRetirement)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      퇴직금 = {years}년차 월급여 {fmtWon(lastYearWage)} × {years}년 × {dc}명 = {fmtWon(totalRetirement)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      * {years}년 운영 후 장애인 {dc}명 전원 퇴사 가정, 퇴직금 = 마지막 월 평균임금 × 근속년수
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── 참고사항 ── */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-[family-name:var(--font-display)]">참고사항</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <ul className="list-inside list-disc space-y-1">
                <li>2026년 최저임금 <strong className="text-foreground">{fmt(MIN_WAGE)}원</strong> 기준, 연 {growthRate}% 상승 반영</li>
                <li>4대보험 요율은 2026년 기준 고정 (실제로는 매년 소폭 변동)</li>
                <li>장려금 단가는 현행 기준 고정 (정부 정책에 따라 변경 가능)</li>
                <li>표준사업장 세액감면 한도: 기본 1억 + 장애인 1인당 2천만원 (조특법 85조의6)</li>
                <li>무상지원금: 장애인 1인당 <strong className="text-foreground">4,000만원</strong>, 최대 10억 (실제 투자금의 75% 한도 별도 적용)</li>
                <li>통합고용세액공제: 2026년 점증구조, 장애인은 우대 대상 (조특법 29조의8)</li>
                <li>통합고용세액공제와 표준사업장 세액감면 <strong className="text-foreground">중복 적용 여부는 세무 전문가 확인 필요</strong></li>
                <li>중견기업 5명, 대기업 10명 <strong className="text-foreground">초과분만</strong> 통합고용세액공제 적용</li>
                <li>단시간근로자(월 60시간 이상) FTE 환산: 시급 최저임금 120% 이상 시 <strong className="text-foreground">0.75명</strong>, 미만 시 <strong className="text-foreground">0.5명</strong></li>
                <li>무상지원금 수령 시 최소 <strong className="text-foreground">7년</strong>, 미수령 시 최소 <strong className="text-foreground">5년</strong> 의무 운영</li>
                <li>컨설팅비: 기본 <strong className="text-foreground">1,000만원</strong> + 장애인 1명당 <strong className="text-foreground">200만원</strong> (최소 3,000만원)</li>
                <li>관리비: 장애인 1명당 월 <strong className="text-foreground">50만원</strong> (운영 기간 전체)</li>
                <li>연계고용 부담금 감면(대기업 도급), 공공기관 우선구매 등 미반영</li>
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
