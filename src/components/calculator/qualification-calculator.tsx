'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calculator, Users, UserCheck, Building2, Percent, ArrowRight } from 'lucide-react';

interface Props {
  onNext?: (data: { nonDisabled: number; minDisabled: number; severeDisabled: number; annualTax: number }) => void;
}

/** 상시근로자 수 기준 중증장애인 필요 인원 계산 */
function calcSevere(totalWorkers: number): number {
  if (totalWorkers < 100) {
    return Math.ceil(totalWorkers * 0.15);
  } else if (totalWorkers < 300) {
    return Math.ceil(totalWorkers * 0.10) + 5;
  } else {
    return Math.ceil(totalWorkers * 0.05) + 20;
  }
}

function calculate(nonDisabled: number) {
  const byFormula = Math.ceil((3 * nonDisabled) / 7);
  const minDisabled = Math.max(byFormula, 10);
  const total = nonDisabled + minDisabled;
  const ratio = total > 0 ? ((minDisabled / total) * 100) : 0;
  const severeDisabled = calcSevere(total);

  let severeRule: string;
  if (total < 100) {
    severeRule = `상시근로자 ${total}명 × 15%`;
  } else if (total < 300) {
    severeRule = `상시근로자 ${total}명 × 10% + 5명`;
  } else {
    severeRule = `상시근로자 ${total}명 × 5% + 20명`;
  }

  return { minDisabled, severeDisabled, total, ratio, byFormula, severeRule };
}

const referenceData = [5, 10, 15, 20, 23, 24, 25, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200, 250, 300].map((n) => {
  const result = calculate(n);
  return { nonDisabled: n, ...result };
});

export function QualificationCalculator({ onNext }: Props) {
  const [input, setInput] = useState('');
  const [taxInput, setTaxInput] = useState('');
  const nonDisabled = parseInt(input) || 0;
  const result = nonDisabled > 0 ? calculate(nonDisabled) : null;

  const stats = result
    ? [
        { label: '필요 장애인 수', value: `${result.minDisabled}명`, sub: result.byFormula < 10 ? '(최소 10명 조건 적용)' : `(공식: ⌈3×${nonDisabled}÷7⌉ = ${result.byFormula})`, icon: UserCheck },
        { label: '중증장애인', value: `${result.severeDisabled}명`, sub: result.severeRule, icon: Users },
        { label: '전체 상시근로자', value: `${result.total}명`, sub: `비장애인 ${nonDisabled}명 + 장애인 ${result.minDisabled}명`, icon: Building2 },
        { label: '장애인 비율', value: `${result.ratio.toFixed(1)}%`, sub: '30% 이상 충족', icon: Percent },
      ]
    : [];

  return (
    <div className="space-y-8">
      {/* 입력 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-[family-name:var(--font-display)]">
            <Calculator className="h-4 w-4" />
            장애인표준사업장 인증 요건 계산
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nonDisabled">현재 비장애인 근로자 수</Label>
              <Input
                id="nonDisabled"
                type="number"
                min="1"
                placeholder="비장애인 수를 입력하세요"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                비장애인 근로자 수를 입력하면 필요한 장애인 고용 인원을 자동 계산합니다.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="q-tax">연간 종합소득세/법인세 (만원)</Label>
              <Input
                id="q-tax"
                type="number"
                min="0"
                placeholder="세금액을 입력하세요"
                value={taxInput}
                onChange={(e) => setTaxInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                비용/혜택 계산기에서 세액감면 시뮬레이션에 사용됩니다.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 계산 결과 */}
      {result && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label}>
              <CardContent className="flex items-center gap-4 p-6">
                <div className="flex h-11 w-11 items-center justify-center border border-border">
                  <stat.icon className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                  <p className="font-[family-name:var(--font-display)] text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 다음 버튼 */}
      {result && onNext && (
        <div className="flex justify-end">
          <Button
            size="lg"
            onClick={() =>
              onNext({
                nonDisabled,
                minDisabled: result.minDisabled,
                severeDisabled: result.severeDisabled,
                annualTax: parseInt(taxInput) || 0,
              })
            }
          >
            비용/혜택 계산기로 이동
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* 계산 공식 설명 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-[family-name:var(--font-display)]">계산 공식</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="border border-border bg-muted/50 p-4">
            <p className="font-mono text-sm">
              필요 장애인 수 = max( ⌈3 × N ÷ 7⌉, 10 )
            </p>
            <p className="mt-1 text-xs text-muted-foreground">N = 비장애인 근로자 수, ⌈⌉ = 올림</p>
          </div>
          <div className="space-y-1.5 text-muted-foreground">
            <p><strong className="text-foreground">왜 3N/7인가?</strong></p>
            <p>장애인 비율 = x ÷ (N + x) ≥ 30% 를 x에 대해 풀면 x ≥ 3N/7 이 됩니다.</p>
            <p>장애인을 고용하면 전체 상시근로자 수도 증가하므로 단순히 N×30%가 아닌 이 공식을 사용합니다.</p>
          </div>

          {/* 중증장애인 기준표 */}
          <div className="space-y-2">
            <p><strong className="text-foreground">중증장애인 고용 기준 (상시근로자 수 기준)</strong></p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>상시근로자 수</TableHead>
                  <TableHead>전체 장애인</TableHead>
                  <TableHead>중증장애인</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>10명 이상 ~ 100명 미만</TableCell>
                  <TableCell>상시근로자의 30%</TableCell>
                  <TableCell className="font-medium">상시근로자의 15%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>100명 이상 ~ 300명 미만</TableCell>
                  <TableCell>상시근로자의 30%</TableCell>
                  <TableCell className="font-medium">상시근로자의 10% + 5명</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>300명 이상</TableCell>
                  <TableCell>상시근로자의 30%</TableCell>
                  <TableCell className="font-medium">상시근로자의 5% + 20명</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div className="space-y-1.5 text-muted-foreground">
            <p><strong className="text-foreground">기본 조건</strong></p>
            <ul className="list-inside list-disc space-y-1">
              <li>장애인 근로자 최소 <strong className="text-foreground">10명</strong> 이상</li>
              <li>전체 근로자의 <strong className="text-foreground">30%</strong> 이상 장애인 고용</li>
              <li>상시근로자 규모에 따른 중증장애인 비율 충족</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* 참고 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-[family-name:var(--font-display)]">비장애인 수별 필요 인원 참고표</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>비장애인</TableHead>
                <TableHead>필요 장애인</TableHead>
                <TableHead>중증장애인</TableHead>
                <TableHead>전체 근로자</TableHead>
                <TableHead>장애인 비율</TableHead>
                <TableHead>비고</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referenceData.map((row) => (
                <TableRow key={row.nonDisabled} className={nonDisabled === row.nonDisabled ? 'bg-primary/5' : ''}>
                  <TableCell className="font-medium">{row.nonDisabled}명</TableCell>
                  <TableCell className="font-[family-name:var(--font-display)] font-semibold">{row.minDisabled}명</TableCell>
                  <TableCell>{row.severeDisabled}명</TableCell>
                  <TableCell>{row.total}명</TableCell>
                  <TableCell>{row.ratio.toFixed(1)}%</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.byFormula < 10 ? '최소 10명 조건' : '30% 공식 적용'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
