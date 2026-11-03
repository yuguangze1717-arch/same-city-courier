import { fail } from './rules.js';
// Home Affairs Department: https://www.had.gov.hk/en/18_districts/my_map.htm
export const DISTRICT_GROUPS = Object.freeze({
  'Hong Kong Island': ['Central and Western', 'Eastern', 'Southern', 'Wan Chai'],
  Kowloon: ['Kowloon City', 'Yau Tsim Mong', 'Sham Shui Po', 'Wong Tai Sin', 'Kwun Tong'],
  'New Territories': ['Tai Po', 'Yuen Long', 'Tuen Mun', 'North', 'Sai Kung', 'Sha Tin', 'Tsuen Wan', 'Kwai Tsing', 'Islands']
});

const districtNames = new Set(Object.values(DISTRICT_GROUPS).flat());
export const isDistrict = value => districtNames.has(String(value ?? '').trim());
export function requireDistrict(value, label) {
  const name = String(value ?? '').trim();
  if (!isDistrict(name)) fail(`Select a valid ${label}`);
  return name;
}
