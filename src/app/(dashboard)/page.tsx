'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QualificationCalculator } from '@/components/calculator/qualification-calculator';
import { CostBenefitCalculator } from '@/components/calculator/cost-benefit-calculator';
import { Calculator, Banknote } from 'lucide-react';

export interface QualificationData {
  nonDisabled: number;
  minDisabled: number;
  severeDisabled: number;
  annualTax: number;
}

export default function HomePage() {
  const [tab, setTab] = useState('qualification');
  const [qualData, setQualData] = useState<QualificationData | null>(null);

  return (
    <div className="space-y-8">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">장애인표준사업장 시뮬레이터</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="qualification" className="gap-1.5">
            <Calculator className="h-4 w-4" />
            자격 계산기
          </TabsTrigger>
          <TabsTrigger value="cost-benefit" className="gap-1.5">
            <Banknote className="h-4 w-4" />
            비용/혜택 계산기
          </TabsTrigger>
        </TabsList>

        <TabsContent value="qualification">
          <QualificationCalculator
            onNext={(data) => {
              setQualData(data);
              setTab('cost-benefit');
            }}
          />
        </TabsContent>

        <TabsContent value="cost-benefit">
          <CostBenefitCalculator initialData={qualData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
