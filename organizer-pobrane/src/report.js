export function formatStructure(report) {
  const lines = [
    report.dryRun ? '\nPlanowana struktura folderów:' : '\nStruktura folderów po operacji:',
    report.directory,
  ];
  report.structure.forEach((item, index) => {
    let status;
    if (item.blocked) status = 'niedostępny lub nazwa zajęta';
    else if (item.existed) status = 'istniejący';
    else if (report.dryRun && item.added > 0) status = 'do utworzenia';
    else if (item.created) status = 'utworzony';
    else status = 'nie będzie tworzony';
    const branch = index === report.structure.length - 1 ? '└──' : '├──';
    const count = report.dryRun ? `nowych do dodania: ${item.added}` : `nowych przeniesionych: ${item.added}`;
    lines.push(`${branch} ${item.category}/ [${status}] — ${count}${item.errors ? `; błędy: ${item.errors}` : ''}`);
  });
  lines.push('Liczby dotyczą wyłącznie tej operacji. Wcześniejszych plików w podfolderach nie wliczono.');
  return lines.join('\n');
}
