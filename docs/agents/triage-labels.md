# Triage Labels

Notion Tasks has no label field. Each role is written into the `Triage:` line at the top of the row's `Notes`, alongside `Status`.

| Label in mattpocock/skills | In our tracker (Notes line)  | Status   |
| -------------------------- | ---------------------------- | -------- |
| `needs-triage`             | `Triage: needs-triage`       | To do    |
| `needs-info`               | `Triage: needs-info`         | To do    |
| `ready-for-agent`          | `Triage: ready-for-agent`    | To do    |
| `ready-for-human`          | `Triage: ready-for-human`    | To do    |
| `wontfix`                  | `Triage: wontfix`            | Done     |

Category roles go on the same line: `Type: bug` / `Type: enhancement`.
A Mise AI row with no `Triage:` line counts as unlabeled. (The 21 review tasks currently start Notes with a priority, e.g. "High:"; keep that after the Triage line.)
Payment, auth and security tasks should be `ready-for-human` (Kyle's task-routing rule).
