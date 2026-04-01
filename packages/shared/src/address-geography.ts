export interface RegionOption {
  code: string;
  name: string;
  cities: string[];
}

const GHANA_REGIONS: RegionOption[] = [
  { code: "AH", name: "Ashanti Region", cities: ["Kumasi", "Obuasi", "Ejisu", "Mampong"] },
  { code: "BA", name: "Brong-Ahafo Region", cities: ["Sunyani", "Techiman", "Berekum", "Dormaa Ahenkro"] },
  { code: "BO", name: "Bono Region", cities: ["Sunyani", "Berekum", "Dormaa Ahenkro", "Wenchi"] },
  { code: "BE", name: "Bono East Region", cities: ["Techiman", "Kintampo", "Atebubu", "Nkoranza"] },
  { code: "CP", name: "Central Region", cities: ["Cape Coast", "Kasoa", "Winneba", "Mankessim"] },
  { code: "EP", name: "Eastern Region", cities: ["Koforidua", "Akosombo", "Nkawkaw", "Suhum"] },
  { code: "AA", name: "Greater Accra Region", cities: ["Accra", "Tema", "Madina", "Kasoa"] },
  { code: "NE", name: "North East Region", cities: ["Nalerigu", "Walewale", "Gambaga", "Chereponi"] },
  { code: "NP", name: "Northern Region", cities: ["Tamale", "Savelugu", "Yendi", "Walewale"] },
  { code: "OT", name: "Oti Region", cities: ["Dambai", "Jasikan", "Kete Krachi", "Nkwanta"] },
  { code: "SV", name: "Savannah Region", cities: ["Damongo", "Bole", "Sawla", "Salaga"] },
  { code: "UE", name: "Upper East Region", cities: ["Bolgatanga", "Navrongo", "Bawku", "Paga"] },
  { code: "UW", name: "Upper West Region", cities: ["Wa", "Lawra", "Jirapa", "Tumu"] },
  { code: "VR", name: "Volta Region", cities: ["Ho", "Keta", "Hohoe", "Aflao"] },
  { code: "WP", name: "Western Region", cities: ["Takoradi", "Sekondi", "Tarkwa", "Axim"] },
  { code: "WN", name: "Western North Region", cities: ["Sefwi Wiawso", "Bibiani", "Aowin", "Bodi"] },
  { code: "TV", name: "Ahafo Region", cities: ["Goaso", "Kenyasi", "Hwidiem", "Duayaw Nkwanta"] },
];

const NIGERIA_STATES: RegionOption[] = [
  { code: "AB", name: "Abia", cities: ["Umuahia", "Aba", "Ohafia", "Arochukwu"] },
  { code: "AD", name: "Adamawa", cities: ["Yola", "Mubi", "Numan", "Ganye"] },
  { code: "AK", name: "Akwa Ibom", cities: ["Uyo", "Eket", "Ikot Ekpene", "Oron"] },
  { code: "AN", name: "Anambra", cities: ["Awka", "Onitsha", "Nnewi", "Ekwulobia"] },
  { code: "BA", name: "Bauchi", cities: ["Bauchi", "Azare", "Misau", "Jama'are"] },
  { code: "BY", name: "Bayelsa", cities: ["Yenagoa", "Brass", "Ogbia", "Sagbama"] },
  { code: "BE", name: "Benue", cities: ["Makurdi", "Gboko", "Otukpo", "Katsina-Ala"] },
  { code: "BO", name: "Borno", cities: ["Maiduguri", "Biu", "Bama", "Dikwa"] },
  { code: "CR", name: "Cross River", cities: ["Calabar", "Ikom", "Ogoja", "Ugep"] },
  { code: "DE", name: "Delta", cities: ["Asaba", "Warri", "Sapele", "Ughelli"] },
  { code: "EB", name: "Ebonyi", cities: ["Abakaliki", "Afikpo", "Onueke", "Ishieke"] },
  { code: "ED", name: "Edo", cities: ["Benin City", "Auchi", "Ekpoma", "Uromi"] },
  { code: "EK", name: "Ekiti", cities: ["Ado Ekiti", "Ikere", "Ijero", "Oye"] },
  { code: "EN", name: "Enugu", cities: ["Enugu", "Nsukka", "Agbani", "Oji River"] },
  { code: "FC", name: "FCT", cities: ["Abuja", "Gwagwalada", "Kuje", "Bwari"] },
  { code: "GO", name: "Gombe", cities: ["Gombe", "Kumo", "Billiri", "Dukku"] },
  { code: "IM", name: "Imo", cities: ["Owerri", "Orlu", "Okigwe", "Mbaise"] },
  { code: "JI", name: "Jigawa", cities: ["Dutse", "Hadejia", "Gumel", "Kazaure"] },
  { code: "KD", name: "Kaduna", cities: ["Kaduna", "Zaria", "Kafanchan", "Saminaka"] },
  { code: "KN", name: "Kano", cities: ["Kano", "Wudil", "Gaya", "Bichi"] },
  { code: "KT", name: "Katsina", cities: ["Katsina", "Daura", "Funtua", "Malumfashi"] },
  { code: "KE", name: "Kebbi", cities: ["Birnin Kebbi", "Argungu", "Yauri", "Zuru"] },
  { code: "KO", name: "Kogi", cities: ["Lokoja", "Okene", "Kabba", "Anyigba"] },
  { code: "KW", name: "Kwara", cities: ["Ilorin", "Offa", "Omu-Aran", "Jebba"] },
  { code: "LA", name: "Lagos", cities: ["Lagos", "Ikeja", "Lekki", "Epe"] },
  { code: "NA", name: "Nasarawa", cities: ["Lafia", "Keffi", "Akwanga", "Karu"] },
  { code: "NI", name: "Niger", cities: ["Minna", "Bida", "Suleja", "Kontagora"] },
  { code: "OG", name: "Ogun", cities: ["Abeokuta", "Ijebu Ode", "Sagamu", "Ota"] },
  { code: "ON", name: "Ondo", cities: ["Akure", "Ondo", "Owo", "Ikare"] },
  { code: "OS", name: "Osun", cities: ["Osogbo", "Ile-Ife", "Ilesa", "Ede"] },
  { code: "OY", name: "Oyo", cities: ["Ibadan", "Ogbomoso", "Oyo", "Iseyin"] },
  { code: "PL", name: "Plateau", cities: ["Jos", "Bukuru", "Pankshin", "Shendam"] },
  { code: "RI", name: "Rivers", cities: ["Port Harcourt", "Bonny", "Ahoada", "Omoku"] },
  { code: "SO", name: "Sokoto", cities: ["Sokoto", "Tambuwal", "Wurno", "Gwadabawa"] },
  { code: "TA", name: "Taraba", cities: ["Jalingo", "Wukari", "Bali", "Serti"] },
  { code: "YO", name: "Yobe", cities: ["Damaturu", "Potiskum", "Gashua", "Nguru"] },
  { code: "ZA", name: "Zamfara", cities: ["Gusau", "Kaura Namoda", "Talata Mafara", "Anka"] },
];

const ADDRESS_GEOGRAPHY: Record<string, RegionOption[]> = {
  GH: GHANA_REGIONS,
  NG: NIGERIA_STATES,
};

export function getRegionsForCountry(countryCode: string | null | undefined): RegionOption[] {
  if (!countryCode) return [];
  return ADDRESS_GEOGRAPHY[countryCode.toUpperCase()] || [];
}

export function getCitiesForCountryRegion(
  countryCode: string | null | undefined,
  regionNameOrCode: string | null | undefined,
): string[] {
  const regions = getRegionsForCountry(countryCode);
  if (!regionNameOrCode) return [];
  const normalized = regionNameOrCode.trim().toLowerCase();
  const region = regions.find(
    (entry) => entry.code.toLowerCase() === normalized || entry.name.toLowerCase() === normalized,
  );
  return region?.cities || [];
}
