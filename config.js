window.DPRO_PET_SALON_CONFIG = {
  version: "DPRO PET SALON BUSINESS CLASS DEMO V1.0 / BRAND-SYSTEM-INTEGRATED",
  system: {
    liveIntegration: true,
    shopCode: "pet_salon_demo",
    legacyApiBase: "https://dpro-pet-salon-api.dpromstk2000.workers.dev",
    ownerUrl: "https://dpromstk2000-lab.github.io/dpro-pet-salon-liff/owner.html?demo=1",
    memberUrl: "https://dpromstk2000-lab.github.io/dpro-pet-salon-liff/member.html?phone=08000002004&demo=1",
    hotelSettingsUrl: "https://dpromstk2000-lab.github.io/dpro-pet-salon-liff/hotel-settings.html?shop_code=pet_salon_demo",
    sourceLabel: "dpro-pet-salon-api 本体直結"
  },
  salon: {
    name: "LUMÉA PET SALON",
    shortName: "LUMÉA",
    tagline: "その子らしさが、いちばん美しく見える場所へ。",
    address: "福岡県福岡市中央区1-2-3（DEMO住所）",
    phone: "092-555-0188（DEMO）",
    hours: "DPRO本体設定に連動",
    closed: "DPRO本体設定に連動",
    instagram: "#",
    lineUrl: "#",
    mapUrl: "#"
  },
  demoCustomer: {
    ownerName: "デモ太郎",
    phone: "08000002004",
    contact: "LINE連携済みDEMO"
  },
  features: { hotel: true, multiStore: true, lineLinkedDemo: true, ownerDemo: true },
  stores: [
    { id: "main", name: "本店", shopCode: "pet_salon_demo", live: true },
    { id: "east", name: "東店（複数店舗表示例）", shopCode: null, live: false }
  ],
  demoPets: [
    { id: "ren", pet_id: "d71838a2-806d-4f85-ba5e-be9b164aa92a", name: "レン", species: "dog", breed: "チワワ", weight: 5.0, age: "3歳", note: "DPRO本体の登録済みDEMOペット" },
    { id: "coco", pet_id: "ed7d2697-f2c0-46ef-af45-a800fabb36eb", name: "ココ", species: "dog", breed: "チワワ", weight: 4.0, age: "4歳", note: "DPRO本体の登録済みDEMOペット" },
    { id: "nana", pet_id: "03be3aa2-a08d-40fd-99e9-ee50f650cb4c", name: "なな", species: "dog", breed: "柴犬", weight: 6.0, age: "4歳", note: "DPRO本体の登録済みDEMOペット" },
    { id: "tia", pet_id: "5e7c694d-4ff7-4865-ba02-77629ca5c776", name: "ティア", species: "dog", breed: "チワワ", weight: 3.8, age: "6歳", note: "DPRO本体の登録済みDEMOペット" }
  ],
  fallbackMenus: [
    { id: "shampoo_small", service_code: "shampoo_small", category: "salon", size: "メニュー", name: "シャンプーコース", duration: 90, price: 4500, description: "DPRO本体のメニュー取得失敗時の表示用" },
    { id: "cut_small", service_code: "cut_small", category: "salon", size: "メニュー", name: "カットコース", duration: 120, price: 7000, description: "DPRO本体のメニュー取得失敗時の表示用" }
  ],
  fallbackOptions: [
    { id: "skin_care", service_code: "skin_care", category: "option", name: "皮膚ケア", duration: 15, price: 1000 }
  ],
  hotel: { dayCarePrice: 2200, nightPrice: 4000, requireVaccineConfirmation: true },
  repeatDemo: { petId: "coco", serviceCode: "cut_small", optionCodes: ["skin_care"] }
};
