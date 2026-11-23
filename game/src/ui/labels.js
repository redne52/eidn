// Ekranda görünen Türkçe adlar (rules.json ASCII yazıyor; burada düzgün harflerle gösterilir)
const N = {
  ejder_ates: 'Ateş Ejderhası', ejder_su: 'Su Ejderhası', ejder_zehir: 'Zehir Ejderhası', ejder_tas: 'Taş Ejderhası',
  kor_ofkesi: "Kor Öfkesi", ates_nefesi: "Ateş Nefesi", kor_pence: "Kor Pençe", alev_saganagi: "Alev Sağanağı", ejder_kukremesi: "Ejder Kükremesi", apsu_pulu: "Apsû Pulu", ea_nin_nefesi: "Ea'nın Nefesi", apsu_pinari: "Apsû Pınarı", gelgit_kanadi: "Gelgit Kanadı", derin_dalga: "Derin Dalga", zehir_pulu: "Zehir Pulu", mor_sis: "Mor Sis Nefesi", zehirli_dis: "Zehirli Diş", bogucu_kuyruk: "Boğucu Kuyruk", zehir_aynasi: "Zehir Aynası", kaya_govde: "Kaya Gövde", dag_darbesi: "Dağ Darbesi", boynuz_carpmasi: "Boynuz Çarpması", tas_kalkan: "Taş Kalkan", esik_kayasi: "Eşik Kayası",
  ugallu: 'Ugallu', girtablullu: 'Girtablullu', kulullu: 'Kulullu', kusarikku: 'Kusarikku',
  basmu: 'Bašmu', kulullu_yabani: 'Yabani Kulullu', ugallu_yabani: 'Yabani Ugallu',
  kusarikku_yabani: 'Yabani Kusarikku', uridimmu: 'Uridimmu', girtablullu_yabani: 'Yabani Girtablullu',
  mushussu: 'Mušḫuššu', lahmu: 'Laḫmu', anzu: 'Anzû', usumgallu: 'Ušumgallu',
  kiyi: 'Kıyı', bozkir: 'Bozkır', derin: 'Derin Edin',
  cig_et: 'Çiğ et', sifali_ot: 'Şifalı ot', sifali_meyve: 'Şifalı meyve', ruh_mantari: 'Ruh mantarı', pismis_et: 'Pişmiş et', sifali_yahni: 'Şifalı yahni', ruhlu_et: 'Ruhlu et',
  can_iksiri: 'Can iksiri', bandaj: 'Bandaj', panzehir: 'Panzehir', donus_tableti: 'Dönüş tableti',
  firtina_pencesi: 'Fırtına pençesi', aslan_ofkesi: 'Aslan öfkesi', kukreme: 'Kükreme',
  zehirli_igne: 'Zehirli iğne', akrep_kabugu: 'Akrep kabuğu', kuyruk_karsiligi: 'Kuyruk karşılığı',
  apsunun_suyu: "Apsû'nun suyu", su_derisi: 'Su derisi', dalga: 'Dalga',
  koruyucu_siper: 'Koruyucu siper', boga_govdesi: 'Boğa gövdesi', boynuz_hucumu: 'Boynuz hücumu',
  zehir: 'Zehir', kanama: 'Kanama', kalkan: 'Siper', yansitma: 'Yansıtma', ofke: 'Öfke', yanik: 'Yanık', sersem: 'Sersem', yavas: 'Yavaş', zayif: 'Zayıf',
  hasar: 'Hasar', iyilestirme: 'İyileştirme', savunma: 'Savunma',
  bas: 'Baş', govde: 'Gövde', kanat: 'Kanat', bacak: 'Bacak',
};
export const tr = (id) => N[id] || (id ? id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, ' ') : '');

export const ROLE_TEXT = {
  ejder_ates: 'Kızıl-kara pullu. Sert ve kritik vuruşlar, ateş nefesi.',
  ejder_su: "Turkuaz pullu. Apsû'nun suyuyla iyileşir, zor yorulur.",
  ejder_zehir: 'Yeşil-mor pullu. Zehirle yavaş ama kesin öldürür.',
  ejder_tas: 'Bronz-kaya pullu. Bloklar, karşılık verir, zor yıkılır.',
  ugallu: 'Fırtına iblisi aslan. Sert ve kritik vuruşlar.',
  girtablullu: 'Akrep-insan. Zehirle yavaş ama kesin öldürür.',
  kulullu: "Balık-insan. Apsû'nun suyuyla kendini iyileştirir.",
  kusarikku: 'Boğa-insan. Bloklar, karşılık verir, zor yıkılır.',
};

export const GRADE_COLOR = { C: '#9aa0a6', B: '#4caf6a', A: '#a061e0', S: '#f2c14e' };
export const LEVEL_COLOR = { kirmizi: '#ff5a4e', turuncu: '#ff9b3d', sari: '#ffd84a', yesil: '#5fd16b', gri: '#9a9a9a' };
export const STATUS_ICON = { zehir: '☠', kanama: '🩸', yanik: '🔥', sersem: '💫', yavas: '🐌', zayif: '⬇', siper: '🛡', kalkan: '🛡', ofke: '😡', bandaj: '🩹', yansitma: '🦂', zayiflatma: '⬇' };
