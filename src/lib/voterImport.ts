export interface VoterImportRow {
  fullName: string;
  identifier: string;
  memberCategory: string;
  association: string;
  eligibility: string;
}

const cellText = (value: unknown) => String(value ?? '').trim();
const headingText = (value: unknown) => cellText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function readVoterImportRows(table: unknown[][]): VoterImportRow[] {
  if (table.length === 0) return [];

  const headingRowIndex = table.findIndex(row => {
    const headings = row.map(headingText);
    return headings.some(heading => heading.includes('name') && heading.includes('member'))
      && headings.some(heading => heading.includes('identifier'));
  });
  const headerIndex = headingRowIndex >= 0 ? headingRowIndex : 0;
  const headings = table[headerIndex].map(headingText);
  const nameIndex = headings.findIndex(heading => heading.includes('name') && heading.includes('member'));
  const firstFieldIndex = nameIndex >= 0 ? nameIndex : headings[0] === '' || headings[0] === '#' ? 1 : 0;
  const fieldIndex = (matches: (heading: string) => boolean, position: number) => {
    const index = headings.findIndex(matches);
    return index >= 0 ? index : firstFieldIndex + position;
  };
  const columns = [
    fieldIndex(heading => heading.includes('name') && heading.includes('member'), 0),
    fieldIndex(heading => heading.includes('identifier'), 1),
    fieldIndex(heading => heading.includes('category') || heading.includes('catetory'), 2),
    fieldIndex(heading => heading.includes('association'), 3),
    fieldIndex(heading => heading.includes('eligibility') && heading.includes('vote'), 4)
  ];

  return table.slice(headerIndex + 1)
    .map(row => columns.map(index => cellText(row[index])))
    .filter(values => values.some(Boolean))
    .map(([fullName, identifier, memberCategory, association, eligibility]) => ({
      fullName, identifier, memberCategory, association, eligibility
    }));
}
