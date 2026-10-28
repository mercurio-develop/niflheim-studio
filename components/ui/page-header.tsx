export function PageHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <header className="flex flex-col gap-2">
      {eyebrow ? <p className="font-mono text-xs text-muted">{eyebrow}</p> : null}
      <h1 className="font-heading text-2xl font-semibold tracking-tight text-text">{title}</h1>
      {description ? <p className="max-w-xl font-sans text-sm text-muted">{description}</p> : null}
    </header>
  );
}

export default PageHeader;
