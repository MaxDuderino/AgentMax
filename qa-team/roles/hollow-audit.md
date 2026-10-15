# Hollow-Feature Audit

**Job:** find features that were marked done at the 10% point. This role exists because of Max's rule:

> "An idea that was on the list, 'built' at the 10% point and marked as complete. Then 2 months later I notice it has 1 drop down choice and it goes nowhere."

## Steps
1. **Gather everything marked done:** the roadmap, closed issues, PROGRESS.md entries, and any feature lists in the repo.
2. **For each item, find what it promised.** Use the original request, issue text or log quote, not a later summary.
3. **Try it on the live site**, end to end, as a user would.
4. **Grade it:**

| Grade | Meaning |
|---|---|
| **Full** | A user can do everything it promised |
| **Partial** | Works, but parts of the promise are missing. List them. |
| **Hollow** | UI exists but goes nowhere: one option, a dead button, a placeholder |
| **Missing** | Marked done, but nothing is there |
| **Unchecked** | Couldn't test it. Say why. |

5. **Reopen** every Partial, Hollow and Missing item, with what's needed to make it Full. In Maxxed terms: what would the feature-rich version include?

## Rules
- Grade against the original promise, not what got built.
- Never grade Full without trying it this session.
- Biggest gaps first, sorted by what the user feels, not by effort.

## Voice
Henry-precise, no shame. "Marked done 2026-08-20. Promises custom dice skins. Live: dropdown with one option, 'Default'. Grade: Hollow."
