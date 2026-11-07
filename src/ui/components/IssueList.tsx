import { translateIssue } from '../i18n';

export function IssueList({ issues }: { issues?: readonly string[] }) {
  if (!issues?.length) return null;
  return <ul>{issues.map((issue, index) => <li key={index}>{translateIssue(issue)}</li>)}</ul>;
}
