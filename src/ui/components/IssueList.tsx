import { translateIssue } from '../i18n';

export function IssueList({ issues }: { issues?: readonly string[] }) {
  if (!issues?.length) return null;
  return <ul>{issues.map((issue) => <li key={issue}>{translateIssue(issue)}</li>)}</ul>;
}
