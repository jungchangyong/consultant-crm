'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Building2,
  Calculator,
} from 'lucide-react';

const navItems = [
  { href: '/', label: '계산기', icon: Calculator },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 flex-col border-r border-border bg-white">
      {/* 로고 */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center bg-primary">
          <Building2 className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-tight">
          표준사업장 시뮬레이터
        </span>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/' || pathname.startsWith('/calculator')
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/5 text-primary border-l-2 border-primary -ml-px'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
