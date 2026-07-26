export type FeatureCardProps = {
  title: string;
  description: string;
};

export function FeatureCard({ title, description }: FeatureCardProps) {
  return (
    <li className="rounded-lg border border-black/10 p-5 dark:border-white/15">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed opacity-80">{description}</p>
    </li>
  );
}
