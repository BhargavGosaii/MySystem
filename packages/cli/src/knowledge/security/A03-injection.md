# OWASP A03: Injection

## Purpose
Mitigate database injection (SQLi), command injection, and template injection risks by ensuring that all user inputs are sanitized, parameterized, or validated before execution.

## Detection Patterns
- Concatenating strings into database query functions.
- Executing child process commands using unvalidated user inputs.
- Evaluating dynamic strings using `eval()` or `new Function()`.

## Code Smells
- `raw("SELECT * FROM users WHERE id = " + req.query.id)`
- `exec("ping -c 1 " + req.body.ip)`
- `db.query(`SELECT * FROM tbl WHERE col = '${val}'`)`

## Strong Indicators
- Direct SQL library calls (`pg`, `mysql2`, `sqlite3`) without placeholders (`?`, `$1`).
- Concatenated ORM raw queries (e.g. Prisma `queryRaw` or `$queryRawUnsafe` with dynamic variables).

## Mitigation
- Use parameterized queries or prepared statements exclusively.
- Use high-level ORM properties with built-in parameterization.
- Sanitize inputs using libraries like `sqlstring` or schema validators.

## Verification Checklist
- [ ] No occurrences of string concatenation inside raw database executions.
- [ ] No occurrences of direct command shell execution containing dynamic inputs.

## Framework Examples
```typescript
// BAD
db.query("SELECT * FROM items WHERE name = '" + name + "'");

// GOOD
db.query("SELECT * FROM items WHERE name = $1", [name]);
```

## Risk Level
Critical
