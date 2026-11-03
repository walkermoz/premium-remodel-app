export default function WorkflowStatusBadge({
  status,
  label,
}: {
  status: string;
  label: string;
}) {
  return (
    <span
      className={`workflow-document-status is-${status.replaceAll("_", "-")}`}
      data-workflow-status={status}
    >
      {label}
    </span>
  );
}
