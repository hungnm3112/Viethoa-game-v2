import fs from "node:fs";
import path from "node:path";

const INPUT_FILE = "input/gamedata/languages/embeddedstrings.xml";
const OUTPUT_FILE = "output/gamedata/languages/embeddedstrings.xml";
const REPORT_FILE = "output/reports/basic-embeddedstrings-report.json";

const replacements = new Map([
  ["NEW_GAME_LOSE_PROGRESS_TITLE", "Choi moi"],
  ["NEW_GAME_LOSE_PROGRESS_DESC", "Bat dau game moi se ghi de file luu hien tai va ban se mat tien do da choi. Ban co chac muon bat dau game moi khong?"],
  ["OPT_TEXT_CANCEL", "Huy"],
  ["OPT_TEXT_CHOOSE_STORAGE_DEVICE", "Chon thiet bi luu"],
  ["OPT_TEXT_CONTINUE", "Tiep tuc"],
  ["OPT_TEXT_CONTINUE_WITHOUT_SAVING", "Tiep tuc khong luu"],
  ["OPT_TEXT_CREATE", "Tao"],
  ["OPT_TEXT_DELETE", "Xoa"],
  ["OPT_TEXT_LOAD", "Tai"],
  ["OPT_TEXT_NO", "Khong"],
  ["OPT_TEXT_OK", "OK"],
  ["OPT_TEXT_OVERWRITE", "Ghi de"],
  ["OPT_TEXT_SAVE_ON_THIS_DEVICE", "Luu tren thiet bi nay"],
  ["OPT_TEXT_SELECT_DEVICE", "Chon thiet bi luu"],
  ["OPT_TEXT_YES", "Co"],
  ["AUTOSAVE_NOTICE_PC", "Game co tinh nang tu dong luu. Khi thay bieu tuong nay, dung tat may hoac thao thiet bi luu."],
  ["SYS_ACHIEVEMENTS", "Thanh tich"],
  ["SYS_CONFIRM_EXIT_TO_MAIN_MENU_BODY", "Ban co chac muon thoat khong? Tien do chua luu se bi mat."],
  ["SYS_CONFIRM_EXIT_TO_MAIN_MENU_TITLE", "Thoat game"],
  ["SYS_CONTINUE", "Tiep tuc"],
  ["SYS_EXIT_GAME", "Thoat game"],
  ["SYS_HELP", "Tro giup"],
  ["SYS_HELP_OPTIONS", "Tro giup & Tuy chon"],
  ["SYS_LEADERBOARDS", "Bang xep hang"],
  ["SYS_MAIN_MENU", "Menu chinh"],
  ["SYS_NEW_GAME", "Choi moi"],
  ["SYS_PAUSE_MENU_TITLE", "Menu game"],
  ["SYS_RESUME", "Tiep tuc"],
  ["SYS_SAVE_AND_EXIT", "Luu va thoat"],
  ["HELP_HOW_TO_PLAY", "Cach choi"],
  ["HELP_CONTROLS", "Dieu khien"],
  ["HELP_SETTINGS", "Cai dat"],
  ["HELP_CREDITS", "Danh de"],
  ["SETTINGS_SFX_VOLUME", "Am luong hieu ung"],
  ["SETTINGS_VOICE_VOLUME", "Am luong giong noi"],
  ["SETTINGS_MUSIC_VOLUME", "Am luong nhac"],
  ["SETTINGS_SUBTITLES", "Phu de"],
  ["SETTINGS_INVERT_Y_AXIS", "Dao truc Y"],
  ["SETTINGS_INVERT_X_AXIS", "Dao truc X"],
  ["SETTINGS_CONTROLLER_VIBRATION", "Rung tay cam"],
  ["SETTINGS_STORAGE_LOCATION", "Doi noi luu"],
  ["SETTINGS_REVERT_TO_DEFAULTS", "Ve mac dinh"],
  ["SETTINGS_HINT_DURATION", "Thoi gian goi y"],
  ["FRONTEND_BACK", "Quay lai"],
  ["FRONTEND_SAVE_EXIT", "Luu va thoat"],
  ["SETTINGS_SENSITIVITY", "Do nhay tay cam"],
  ["SETTINGS_GRAPHICS_MIN", "Do hoa - toi thieu"],
  ["SETTINGS_GRAPHICS_MED", "Do hoa - trung binh"],
  ["SETTINGS_GRAPHICS_MAX", "Do hoa - cao"],
  ["SETTINGS_GRAPHICS_ULTRA", "Do hoa - cuc cao"],
  ["SETTINGS_SPEAKERS_MONO", "Loa - mono"],
  ["SETTINGS_SPEAKERS_STEREO", "Loa - stereo"],
  ["SETTINGS_SPEAKERS_SURROUND", "Loa - surround"],
  ["SETTINGS_VSYNC", "Dong bo doc"],
  ["SETTINGS_FULLSCREEN", "Toan man hinh"],
  ["SETTINGS_GAMMA", "Gamma"],
  ["SETTINGS_GRAPHICS", "Cai dat do hoa"],
  ["SETTINGS_GAME", "Cai dat game"],
  ["SETTINGS_SOUND", "Cai dat am thanh"],
  ["SETTINGS_GRAPHICS_ASPECT_RATIO", "Ti le man hinh"],
  ["SETTINGS_GRAPHICS_RESOLUTION", "Do phan giai"],
  ["SELECT_SAVE_SLOT", "Chon o luu"],
  ["EMPTY_SAVE_SLOT", "- Trong -"],
  ["SYS_PLAY_GAME", "Choi game"],
  ["DELETE_SAVE_SLOT", "Xoa file luu"],
  ["SYS_START_GAME", "Bat dau game"],
  ["SYS_PLAY_SOD", "Choi State of Decay"],
  ["SETTINGS_MOUSE_SENSITIVITY", "Do nhay chuot"],
  ["SETTINGS_MOUSE_INVERT_X_AXIS", "Dao truc X cua chuot"],
  ["SETTINGS_MOUSE_INVERT_Y_AXIS", "Dao truc Y cua chuot"],
  ["SETTINGS_CONTROLLER_INVERT_X_AXIS", "Dao truc X tay cam"],
  ["SETTINGS_CONTROLLER_INVERT_Y_AXIS", "Dao truc Y tay cam"],
  ["CONTROLS_MENU_JOURNAL", "Nhat ky"],
  ["CONTROLS_MENU_RADIO", "Radio"],
  ["CONTROLS_MENU_MAP", "Ban do"],
  ["CONTROLS_MENU_SOCIAL", "Xa hoi"],
  ["CONTROLS_UI_ACTIVATE", "Kich hoat"],
  ["CONTROLS_UI_BACK_PAUSE", "Quay lai/Tam dung"],
  ["CONTROLS_UI_PREV_TAB", "Tab truoc"],
  ["CONTROLS_UI_NEXT_TAB", "Tab sau"],
  ["CONTROLS_UI_UP", "Len"],
  ["CONTROLS_UI_DOWN", "Xuong"],
  ["CONTROLS_UI_LEFT", "Trai"],
  ["CONTROLS_UI_RIGHT", "Phai"],
  ["CONTROLS_MAP_NEXT_POI", "Diem tiep theo"],
  ["CONTROLS_MAP_PREV_POI", "Diem truoc"],
  ["CONTROLS_MAP_LEGEND", "Bat/tat chu giai"],
  ["CONTROLS_MAP_WAYPOINT", "Bat/tat diem den"],
  ["CONTROLS_NAV_MOVELEFT", "Di sang trai"],
  ["CONTROLS_NAV_MOVERIGHT", "Di sang phai"],
  ["CONTROLS_NAV_MOVEFORWARD", "Di toi"],
  ["CONTROLS_NAV_MOVEBACK", "Di lui"],
  ["CONTROLS_NAV_SPRINT", "Chay nhanh"],
  ["CONTROLS_NAV_JUMP", "Nhay"],
  ["CONTROLS_NAV_SNEAK", "Di len"],
  ["CONTROLS_NAV_ROLL", "Lan ne"],
  ["CONTROLS_NAV_INTERACT", "Tuong tac"],
  ["CONTROLS_COMBAT_ZOOM", "Nham / Quan sat"],
  ["CONTROLS_COMBAT_SHOOT", "Ban"],
  ["CONTROLS_COMBAT_MELEE", "Danh can chien"],
  ["CONTROLS_COMBAT_EXECUTE", "Ket lieu"],
  ["CONTROLS_COMBAT_RELOAD", "Nap dan"],
  ["CONTROLS_ITEM_USE", "Dung vat pham"],
  ["CONTROLS_ITEM_NEXT", "Vat pham tiep"],
  ["CONTROLS_ITEM_PREV", "Vat pham truoc"],
  ["CONTROLS_ITEM_DROP", "Tha balo hang"],
  ["CONTROLS_ITEM_LIGHT", "Den pin"],
  ["CONTROLS_VEH_EXIT", "Ra khoi xe"],
  ["CONTROLS_VEH_HORN", "Coi xe"],
  ["CONTROLS_VEH_LIGHTS", "Den xe"],
  ["CONTROLS_VEH_ACCEL", "Tang toc"],
  ["CONTROLS_VEH_LEFT", "Re trai"],
  ["CONTROLS_VEH_RIGHT", "Re phai"],
  ["CONTROLS_VEH_BRAKE", "Phanh / Lui"],
  ["CONTROLS_MENU_HEADING", "Menu"],
  ["CONTROLS_UI_HEADING", "Giao dien"],
  ["CONTROLS_MAP_HEADING", "Ban do"],
  ["CONTROLS_NAV_HEADING", "Di chuyen"],
  ["CONTROLS_COMBAT_HEADING", "Chien dau"],
  ["CONTROLS_ITEM_HEADING", "Vat pham"],
  ["CONTROLS_VEH_HEADING", "Lai xe"],
  ["CONTROLS_REBIND_HEADING", "Gan lai %s"],
  ["CONTROLS_REBIND_DETAILS", "Nhan phim mong muon"],
  ["CONTROLS_NAV_CAMERA", "Camera / Zoom"],
  ["CONTROLS_UI_SCROLL_UP", "Cuon len"],
  ["CONTROLS_UI_SCROLL_DOWN", "Cuon xuong"],
]);

if (!fs.existsSync(INPUT_FILE)) {
  throw new Error(`Missing ${INPUT_FILE}. Run: npm run extract -- --group languages`);
}

let xml = fs.readFileSync(INPUT_FILE, "utf8");
const patched = [];
const missing = [];

for (const [id, text] of replacements) {
  const escapedText = encodeXmlAttribute(text);
  const pattern = new RegExp(`(<EmbeddedText\\b(?=[^>]*\\bId="${escapeRegExp(id)}")[^>]*\\bText=")([^"]*)("[^>]*/>)`);
  const nextXml = xml.replace(pattern, (_, before, oldText, after) => {
    patched.push({ id, from: decodeXmlAttribute(oldText), to: text });
    return `${before}${escapedText}${after}`;
  });

  if (nextXml === xml) {
    missing.push({ id, to: text });
  }
  xml = nextXml;
}

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, xml, "utf8");

const report = {
  generatedAt: new Date().toISOString(),
  inputFile: INPUT_FILE,
  outputFile: OUTPUT_FILE,
  patchedCount: patched.length,
  missingCount: missing.length,
  patched,
  missing,
};

fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + "\n", "utf8");

console.log(`Wrote ${OUTPUT_FILE}`);
console.log(`Wrote ${REPORT_FILE}`);
console.log(`Patched ${patched.length}/${replacements.size}. Missing: ${missing.length}.`);

function encodeXmlAttribute(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodeXmlAttribute(value) {
  return value.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (match, entity) => {
    if (entity.startsWith("#x")) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return {
      amp: "&",
      lt: "<",
      gt: ">",
      quot: "\"",
      apos: "'",
    }[entity] ?? match;
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
