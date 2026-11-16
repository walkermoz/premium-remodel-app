import { ArrowUpRight } from "lucide-react";

type Resource = { label: string; href: string };

export default function ConnectionSetupGuide({
  title,
  steps,
  resources = [],
  platform = false,
}: {
  title: string;
  steps: string[];
  resources?: Resource[];
  platform?: boolean;
}) {
  return (
    <div className="connection-setup-guide">
      <div className="connection-setup-guide-heading">
        <strong>{title}</strong>
        {platform && <span>One-time platform setup</span>}
      </div>
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {resources.length > 0 && (
        <div className="connection-setup-resources">
          {resources.map((resource) => (
            <a
              key={resource.href}
              href={resource.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {resource.label} <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
