export function resolveDarkTheme(theme, projectDarkMode, systemDark) {
  if (theme === 'dark') return true
  if (theme === 'light' || theme === 'warm') return false
  return projectDarkMode ?? systemDark
}
