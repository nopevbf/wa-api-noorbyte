# Windows Shell Rules

When running shell commands on Windows:

- Always execute commands through PowerShell 7 using:
  `pwsh -NoProfile -Command "& { <command> }"`

- Do not run commands directly in `powershell.exe`.

- Do not use Windows PowerShell 5.1 syntax unless explicitly requested.

- `||` and `&&` are allowed only inside the `pwsh -NoProfile -Command "& { ... }"` wrapper.

- For multi-step commands, put all steps inside one PowerShell script block:
  `pwsh -NoProfile -Command "& { command1; command2; command3 }"`

- When a command contains quotes, prefer single quotes inside the PowerShell command:
  `pwsh -NoProfile -Command "& { Write-Host 'hello' }"`

- Use PowerShell path syntax on Windows. Prefer quoted paths when spaces are possible:
  `Set-Location 'C:\path with spaces\project'`

- For external CLI tools like `npm`, `node`, `git`, `python`, `pnpm`, or `bun`, check failure using PowerShell 7 operators only inside `pwsh`:
  `pwsh -NoProfile -Command "& { npm test || Write-Host 'failed' }"`

- Before assuming PowerShell 7 syntax is available, verify with:
  `pwsh -NoProfile -Command "$PSVersionTable.PSVersion"`