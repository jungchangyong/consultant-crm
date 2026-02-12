export function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-white px-8">
      <div className="flex items-center gap-3">
        <h2 className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          })}
        </h2>
      </div>
    </header>
  );
}
