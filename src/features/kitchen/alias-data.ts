// Vendored from Ollie (packages/logic/src/grocery/data.ts + types.ts) on
// 2026-06-11 — alias table only; the recipe table stays in Ollie until the
// Feed Me phase. Pure data, no I/O.
//
// What it buys Roomie: "süt" = "milk" = "sutt" land on ONE canonical item,
// each with a category (for the emoji) and a shelf life (for quiet aging).

export type GroceryCategory =
  | 'dairy'
  | 'meat'
  | 'deli'
  | 'produce'
  | 'drinks'
  | 'pantry'
  | 'cleaning'
  | 'frozen'
  | 'snacks'
  | 'supplements'
  | 'other';

export interface AliasEntry {
  aliases: string[];
  category: GroceryCategory;
  shelfLifeDays: number;
}

type AliasTable = Record<string, AliasEntry>;

export const CATEGORY_EMOJI: Record<GroceryCategory, string> = {
  dairy: '🥛',
  meat: '🥩',
  deli: '🥪',
  produce: '🥬',
  drinks: '☕',
  pantry: '🫙',
  cleaning: '🧽',
  frozen: '🧊',
  snacks: '🍿',
  supplements: '💊',
  other: '🧺',
};

// Item-level emoji for the staples people actually type; the category emoji
// is only the fallback (so lemon is 🍋, not the leafy-greens 🥬).
const ITEM_EMOJI: Record<string, string> = {
  milk: '🥛',
  egg: '🥚',
  cheese: '🧀',
  feta: '🧀',
  mozzarella: '🧀',
  parmesan: '🧀',
  butter: '🧈',
  bread: '🍞',
  tomato: '🍅',
  onion: '🧅',
  garlic: '🧄',
  potato: '🥔',
  'sweet potato': '🍠',
  carrot: '🥕',
  cucumber: '🥒',
  eggplant: '🍆',
  'bell pepper': '🫑',
  'hot pepper': '🌶️',
  mushroom: '🍄',
  broccoli: '🥦',
  corn: '🌽',
  banana: '🍌',
  apple: '🍎',
  orange: '🍊',
  lemon: '🍋',
  lime: '🍋',
  avocado: '🥑',
  strawberry: '🍓',
  blueberry: '🫐',
  grape: '🍇',
  water: '💧',
  juice: '🧃',
  coffee: '☕',
  tea: '🍵',
  beer: '🍺',
  wine: '🍷',
  soda: '🥤',
  fanta: '🥤',
  sprite: '🥤',
  'iced tea': '🥤',
  'canned beans': '🫘',
  rice: '🍚',
  pasta: '🍝',
  honey: '🍯',
  'peanut butter': '🥜',
  nuts: '🥜',
  chicken: '🍗',
  fish: '🐟',
  shrimp: '🦐',
  bacon: '🥓',
  'olive oil': '🫒',
  olives: '🫒',
  salt: '🧂',
  'ice cream': '🍦',
  'frozen pizza': '🍕',
  chocolate: '🍫',
  cookies: '🍪',
  candy: '🍬',
  popcorn: '🍿',
  'toilet paper': '🧻',
  'paper towel': '🧻',
  shampoo: '🧴',
  toothpaste: '🪥',
  lentil: '🫘',
  chickpea: '🫘',
  'black bean': '🫘',
  'white bean': '🫘',
};

// The one emoji a pantry row shows: item override → category → basket.
export function itemEmoji(name: string, category: GroceryCategory | string): string {
  return (
    ITEM_EMOJI[name] ?? CATEGORY_EMOJI[(category as GroceryCategory) ?? 'other'] ?? '🧺'
  );
}

function buildAliasTable(): AliasTable {
  const T: AliasTable = {};
  const add = (
    canon: string,
    aliases: string[],
    category: GroceryCategory,
    shelfLifeDays: number,
  ) => {
    T[canon] = { aliases: aliases.slice(), category, shelfLifeDays };
  };
  // Dairy
  add('milk', ['milk','süt','sut','whole milk','2% milk','skim milk'], 'dairy', 7);
  add('yogurt', ['yogurt','yogurts','yog','yoğurt','yogurd','greek yogurt','plain yogurt'], 'dairy', 21);
  add('cheese', ['cheese','cheddar','gouda','kaşar','kasar','peynir'], 'dairy', 30);
  add('feta', ['feta','beyaz peynir'], 'dairy', 30);
  add('butter', ['butter','tereyağı','tereyagi','salted butter','unsalted butter'], 'dairy', 60);
  add('cream', ['cream','krema','heavy cream','whipping cream'], 'dairy', 10);
  add('sour cream', ['sour cream','ekşi krema','eksi krema'], 'dairy', 14);
  add('cottage cheese', ['cottage cheese','lor'], 'dairy', 10);
  add('cream cheese', ['cream cheese','philly'], 'dairy', 30);
  add('egg', ['egg','eggs','dozen eggs','yumurta'], 'dairy', 28);
  add('mozzarella', ['mozzarella','fresh mozzarella'], 'dairy', 14);
  add('parmesan', ['parmesan','parmigiano','parmigiano reggiano'], 'dairy', 90);
  add('ricotta', ['ricotta'], 'dairy', 14);
  add('kefir', ['kefir'], 'dairy', 14);
  add('labneh', ['labneh','labne','süzme yoğurt','suzme yogurt'], 'dairy', 14);
  // Meat
  add('chicken', ['chicken','tavuk','chicken breast','chicken thigh'], 'meat', 2);
  add('ground beef', ['ground beef','mince','kıyma','kiyma','dana kıyma','dana kiyma'], 'meat', 2);
  add('beef', ['beef','dana','biftek','steak','ribeye'], 'meat', 4);
  add('lamb', ['lamb','kuzu','lamb chop'], 'meat', 4);
  add('pork', ['pork','pork chop','pork loin'], 'meat', 4);
  add('turkey', ['turkey','hindi'], 'meat', 2);
  add('fish', ['fish','balık','balik','somon','levrek','salmon'], 'meat', 2);
  add('shrimp', ['shrimp','karides','prawns'], 'meat', 2);
  add('ground turkey', ['ground turkey','hindi kıyma','hindi kiyma'], 'meat', 2);
  add('sausage', ['sausage','sucuk','sosis','italian sausage'], 'meat', 14);
  add('bacon', ['bacon','pastırma','pastirma'], 'meat', 14);
  add('veal', ['veal','dana eti'], 'meat', 4);
  add('duck', ['duck','ördek','ordek'], 'meat', 4);
  add('liver', ['liver','ciğer','ciger','dana ciğeri','dana cigeri'], 'meat', 2);
  add('mussels', ['mussels','midye'], 'meat', 2);
  // Deli
  add('ham', ['ham','jambon','smoked ham'], 'deli', 7);
  add('salami', ['salami','salam','sucuklu salam'], 'deli', 21);
  add('prosciutto', ['prosciutto','parma'], 'deli', 21);
  add('pepperoni', ['pepperoni'], 'deli', 21);
  add('turkey slices', ['turkey slices','hindi füme','hindi fume','sliced turkey'], 'deli', 7);
  add('chicken slices', ['chicken slices','tavuk füme','tavuk fume'], 'deli', 7);
  add('mortadella', ['mortadella','mortadel'], 'deli', 21);
  add('chorizo', ['chorizo'], 'deli', 21);
  add('hot dog', ['hot dog','frankfurter'], 'deli', 14);
  add('roast beef', ['roast beef','deli beef'], 'deli', 7);
  // Produce
  add('tomato', ['tomato','tomatoes','domates','cherry tomato','vine tomato'], 'produce', 7);
  add('onion', ['onion','onions','soğan','sogan','yellow onion','red onion'], 'produce', 30);
  add('garlic', ['garlic','sarımsak','sarimsak','garlic clove'], 'produce', 90);
  add('potato', ['potato','potatoes','patates','russet','yukon'], 'produce', 30);
  add('sweet potato', ['sweet potato','tatlı patates','tatli patates','yam'], 'produce', 21);
  add('carrot', ['carrot','carrots','havuç','havuc','baby carrots'], 'produce', 21);
  add('celery', ['celery','kereviz sapı','kereviz sapi'], 'produce', 14);
  add('cucumber', ['cucumber','salatalık','salatalik'], 'produce', 7);
  add('zucchini', ['zucchini','kabak','courgette'], 'produce', 7);
  add('eggplant', ['eggplant','patlıcan','patlican','aubergine'], 'produce', 7);
  add('bell pepper', ['bell pepper','dolma biber','red pepper','green pepper'], 'produce', 10);
  add('hot pepper', ['hot pepper','sivri biber','acı biber','aci biber','jalapeño','jalapeno'], 'produce', 14);
  add('spinach', ['spinach','ıspanak','ispanak','baby spinach'], 'produce', 5);
  add('arugula', ['arugula','roka','rocket'], 'produce', 5);
  add('lettuce', ['lettuce','marul','romaine','iceberg'], 'produce', 7);
  add('kale', ['kale','karalahana','lacinato'], 'produce', 7);
  add('cabbage', ['cabbage','lahana'], 'produce', 30);
  add('parsley', ['parsley','maydanoz'], 'produce', 7);
  add('cilantro', ['cilantro','kişniş','kisnis','coriander'], 'produce', 5);
  add('basil', ['basil','fesleğen','feslegen'], 'produce', 5);
  add('mint', ['mint','nane'], 'produce', 7);
  add('dill', ['dill','dereotu'], 'produce', 5);
  add('mushroom', ['mushroom','mushrooms','mantar','button mushroom','cremini'], 'produce', 7);
  add('broccoli', ['broccoli','brokoli'], 'produce', 7);
  add('cauliflower', ['cauliflower','karnabahar'], 'produce', 7);
  add('green beans', ['green beans','taze fasulye'], 'produce', 7);
  add('asparagus', ['asparagus','kuşkonmaz','kuskonmaz'], 'produce', 5);
  add('artichoke', ['artichoke','enginar'], 'produce', 7);
  add('leek', ['leek','pırasa','pirasa'], 'produce', 14);
  add('radish', ['radish','turp'], 'produce', 14);
  add('beet', ['beet','pancar','beetroot'], 'produce', 30);
  add('banana', ['banana','bananas','muz'], 'produce', 7);
  add('apple', ['apple','apples','elma','gala','fuji','granny smith'], 'produce', 30);
  add('orange', ['orange','oranges','portakal','navel'], 'produce', 21);
  add('lemon', ['lemon','lemons','limon'], 'produce', 21);
  add('lime', ['lime','misket limon'], 'produce', 14);
  add('avocado', ['avocado','avokado','hass'], 'produce', 5);
  add('strawberry', ['strawberry','strawberries','çilek','cilek'], 'produce', 5);
  add('blueberry', ['blueberry','blueberries','yaban mersini'], 'produce', 7);
  add('grape', ['grape','grapes','üzüm','uzum'], 'produce', 7);
  // Drinks
  add('water', ['water','su','maden suyu','sparkling water'], 'drinks', 365);
  add('juice', ['juice','meyve suyu','oj','apple juice','orange juice'], 'drinks', 10);
  add('coffee', ['coffee','kahve','beans','ground coffee'], 'drinks', 365);
  add('tea', ['tea','çay','cay','black tea','green tea'], 'drinks', 730);
  add('oat milk', ['oat milk','oatmilk'], 'drinks', 10);
  add('almond milk', ['almond milk','almondmilk'], 'drinks', 10);
  add('soy milk', ['soy milk','soymilk'], 'drinks', 10);
  add('beer', ['beer','bira','lager','ipa'], 'drinks', 120);
  add('wine', ['wine','şarap','sarap','red wine','white wine'], 'drinks', 730);
  add('soda', ['soda','gazoz','kola','cola','coke','coca-cola','coca cola','pepsi','pepsi cola','coke zero','diet coke','cola zero','soft drink','fizzy drink'], 'drinks', 270);
  add('fanta', ['fanta','orange soda','portakallı gazoz','portakalli gazoz'], 'drinks', 270);
  add('sprite', ['sprite','7up','seven up','lemon lime soda','limonlu gazoz'], 'drinks', 270);
  add('iced tea', ['iced tea','ice tea','ice-tea','buzlu çay','buzlu cay','soğuk çay','soguk cay','fuze tea','lipton ice tea'], 'drinks', 270);
  add('kombucha', ['kombucha'], 'drinks', 21);
  add('sparkling', ['sparkling','perrier','la croix'], 'drinks', 270);
  add('lemonade', ['lemonade','limonata'], 'drinks', 10);
  add('ayran', ['ayran'], 'drinks', 14);
  add('energy drink', ['energy drink','red bull','redbull','monster','monster energy','rockstar'], 'drinks', 365);
  add('capri sun', ['capri sun','caprisun','capri-sun'], 'drinks', 365);
  // Pantry
  add('rice', ['rice','pirinç','pirinc','basmati','jasmine'], 'pantry', 730);
  add('pasta', ['pasta','makarna','spaghetti','penne','fusilli'], 'pantry', 730);
  add('flour', ['flour','un','all-purpose flour','all purpose flour'], 'pantry', 365);
  add('sugar', ['sugar','şeker','seker','white sugar'], 'pantry', 730);
  add('brown sugar', ['brown sugar','esmer şeker','esmer seker'], 'pantry', 730);
  add('salt', ['salt','tuz','sea salt','kosher salt'], 'pantry', 3650);
  add('black pepper', ['black pepper','karabiber','ground pepper'], 'pantry', 1095);
  add('olive oil', ['olive oil','zeytinyağı','zeytinyagi','evoo','extra virgin olive oil','extra virgin'], 'pantry', 730);
  add('vegetable oil', ['vegetable oil','ayçiçek yağı','aycicek yagi','canola','sunflower oil'], 'pantry', 365);
  add('sesame oil', ['sesame oil','susam yağı','susam yagi'], 'pantry', 365);
  add('vinegar', ['vinegar','sirke','white vinegar','apple cider vinegar'], 'pantry', 1825);
  add('balsamic', ['balsamic','balsamic vinegar'], 'pantry', 1825);
  add('soy sauce', ['soy sauce','soya sosu'], 'pantry', 1095);
  add('tomato sauce', ['tomato sauce','salça','salca','marinara','pasta sauce'], 'pantry', 10);
  add('tomato paste', ['tomato paste'], 'pantry', 365);
  add('ketchup', ['ketchup','ketçap','ketcap','tomato ketchup','heinz','heinz ketchup'], 'pantry', 180);
  add('mayo', ['mayo','mayonez','mayonnaise'], 'pantry', 60);
  add('mustard', ['mustard','hardal','dijon'], 'pantry', 365);
  add('honey', ['honey','bal'], 'pantry', 3650);
  add('peanut butter', ['peanut butter','fıstık ezmesi','fistik ezmesi','pb'], 'pantry', 90);
  add('jam', ['jam','reçel','recel','jelly','preserves'], 'pantry', 365);
  add('bread', ['bread','ekmek','loaf','sourdough','rye'], 'pantry', 5);
  add('tortilla', ['tortilla','lavaş','lavas','wraps'], 'pantry', 21);
  add('cereal', ['cereal','mısır gevreği','misir gevregi','cornflakes','granola'], 'pantry', 180);
  add('oats', ['oats','yulaf','oatmeal','rolled oats'], 'pantry', 730);
  add('quinoa', ['quinoa','kinoa'], 'pantry', 730);
  add('couscous', ['couscous','kuskus'], 'pantry', 730);
  add('bulgur', ['bulgur'], 'pantry', 730);
  add('lentil', ['lentil','lentils','mercimek','red lentil'], 'pantry', 1095);
  add('chickpea', ['chickpea','chickpeas','nohut','garbanzo'], 'pantry', 1095);
  add('black bean', ['black bean','black beans','fasulye'], 'pantry', 1095);
  add('white bean', ['white bean','kuru fasulye','cannellini'], 'pantry', 1095);
  add('canned tomato', ['canned tomato','diced tomatoes','crushed tomatoes'], 'pantry', 730);
  add('canned beans', ['canned beans','baked beans','konserve fasulye'], 'pantry', 730);
  add('chicken stock', ['chicken stock','tavuk suyu','chicken broth'], 'pantry', 365);
  add('beef stock', ['beef stock','beef broth'], 'pantry', 365);
  add('nuts', ['nuts','badem','ceviz','kaju','almonds'], 'pantry', 365);
  add('raisins', ['raisins','kuru üzüm','kuru uzum'], 'pantry', 365);
  add('olives', ['olives','zeytin','kalamata'], 'pantry', 180);
  add('tahini', ['tahini','tahin'], 'pantry', 730);
  add('yeast', ['yeast','maya','instant yeast','active dry yeast'], 'pantry', 365);
  // Cleaning
  add('toilet paper', ['toilet paper','tuvalet kağıdı','tuvalet kagidi','tp'], 'cleaning', 9999);
  add('paper towel', ['paper towel','kağıt havlu','kagit havlu'], 'cleaning', 9999);
  add('tissue', ['tissue','mendil','kleenex'], 'cleaning', 9999);
  add('dish soap', ['dish soap','bulaşık deterjanı','bulasik deterjani','fairy'], 'cleaning', 1825);
  add('laundry detergent', ['laundry detergent','çamaşır deterjanı','camasir deterjani'], 'cleaning', 365);
  add('fabric softener', ['fabric softener','yumuşatıcı','yumusatici'], 'cleaning', 365);
  add('bleach', ['bleach','çamaşır suyu','camasir suyu'], 'cleaning', 365);
  add('all purpose cleaner', ['all purpose cleaner','yüzey temizleyici','yuzey temizleyici'], 'cleaning', 730);
  add('sponge', ['sponge','sünger','sunger'], 'cleaning', 9999);
  add('trash bag', ['trash bag','çöp poşeti','cop poseti','garbage bag'], 'cleaning', 9999);
  add('dishwasher tabs', ['dishwasher tabs','makine tableti','finish tabs'], 'cleaning', 365);
  add('shampoo', ['shampoo','şampuan','sampuan'], 'cleaning', 1095);
  add('conditioner', ['conditioner','saç kremi','sac kremi'], 'cleaning', 1095);
  add('body wash', ['body wash','duş jeli','dus jeli'], 'cleaning', 1095);
  add('toothpaste', ['toothpaste','diş macunu','dis macunu'], 'cleaning', 730);
  // Frozen
  add('frozen pizza', ['frozen pizza'], 'frozen', 180);
  add('frozen veggies', ['frozen veggies','dondurulmuş sebze','dondurulmus sebze','mixed veg'], 'frozen', 240);
  add('frozen berries', ['frozen berries','dondurulmuş meyve','dondurulmus meyve'], 'frozen', 240);
  add('frozen peas', ['frozen peas','dondurulmuş bezelye','dondurulmus bezelye'], 'frozen', 240);
  add('ice cream', ['ice cream','dondurma','gelato'], 'frozen', 60);
  add('frozen shrimp', ['frozen shrimp','dondurulmuş karides','dondurulmus karides'], 'frozen', 180);
  add('frozen fish', ['frozen fish','dondurulmuş balık','dondurulmus balik','frozen salmon'], 'frozen', 180);
  add('frozen chicken', ['frozen chicken','dondurulmuş tavuk','dondurulmus tavuk'], 'frozen', 270);
  add('frozen fries', ['frozen fries','dondurulmuş patates','dondurulmus patates'], 'frozen', 240);
  add('frozen dough', ['frozen dough','hamur','pizza dough','croissant dough'], 'frozen', 60);
  // Snacks
  add('chips', ['chips','cips','lays','ruffles','doritos'], 'snacks', 60);
  add('crackers', ['crackers','kraker','ritz'], 'snacks', 120);
  add('chocolate', ['chocolate','çikolata','cikolata','dark chocolate','milk chocolate'], 'snacks', 365);
  add('cookies', ['cookies','kurabiye','bisküvi','biskuvi','biscuits'], 'snacks', 90);
  add('candy', ['candy','gummies'], 'snacks', 365);
  add('popcorn', ['popcorn','mısır patlağı','misir patlagi'], 'snacks', 240);
  add('pretzels', ['pretzels'], 'snacks', 120);
  add('trail mix', ['trail mix','gorp'], 'snacks', 180);
  add('granola bar', ['granola bar','kind bar','clif bar'], 'snacks', 180);
  add('nuts mix', ['nuts mix','kuruyemiş','kuruyemis','mixed nuts'], 'snacks', 180);
  add('dried fruit', ['dried fruit','kuru meyve'], 'snacks', 365);
  add('rice cakes', ['rice cakes','pirinç patlağı','pirinc patlagi'], 'snacks', 180);
  add('hummus', ['hummus','humus'], 'snacks', 10);
  add('salsa', ['salsa'], 'snacks', 30);
  add('pickles', ['pickles','turşu','tursu'], 'snacks', 365);
  // Supplements
  add('multivitamin', ['multivitamin','multi'], 'supplements', 730);
  add('vitamin d', ['vitamin d','d3','d vitamini'], 'supplements', 730);
  add('vitamin c', ['vitamin c','c vitamini'], 'supplements', 730);
  add('magnesium', ['magnesium','mag glycinate','magnezyum'], 'supplements', 730);
  add('iron', ['iron','demir','ferritin'], 'supplements', 730);
  add('omega 3', ['omega 3','balık yağı','balik yagi','fish oil'], 'supplements', 365);
  add('b12', ['b12','vitamin b12'], 'supplements', 730);
  add('probiotics', ['probiotics','probiyotik'], 'supplements', 365);
  add('electrolytes', ['electrolytes','lmnt','liquid iv'], 'supplements', 730);
  add('melatonin', ['melatonin'], 'supplements', 730);
  // Spices (stored under pantry category)
  add('cumin', ['cumin','kimyon'], 'pantry', 1095);
  add('paprika', ['paprika','kırmızı toz biber','kirmizi toz biber','smoked paprika'], 'pantry', 1095);
  add('oregano', ['oregano'], 'pantry', 1095);
  add('thyme', ['thyme','kekik'], 'pantry', 1095);
  add('rosemary', ['rosemary','biberiye'], 'pantry', 1095);
  add('bay leaf', ['bay leaf','defne yaprağı','defne yapragi'], 'pantry', 1095);
  add('chili flakes', ['chili flakes','pul biber','red pepper flakes'], 'pantry', 1095);
  add('cinnamon', ['cinnamon','tarçın','tarcin','ground cinnamon'], 'pantry', 1095);
  add('turmeric', ['turmeric','zerdeçal','zerdecal'], 'pantry', 1095);
  add('ginger', ['ginger','zencefil','fresh ginger','ground ginger'], 'pantry', 1095);
  add('nutmeg', ['nutmeg','küçük hindistan cevizi','kucuk hindistan cevizi'], 'pantry', 1095);
  add('clove', ['clove','karanfil','ground clove'], 'pantry', 1095);
  add('cardamom', ['cardamom','kakule'], 'pantry', 1095);
  add('sumac', ['sumac','sumak'], 'pantry', 1095);
  add('mint dried', ['mint dried','kuru nane'], 'pantry', 1095);
  return T;
}

export const ALIAS_TABLE: AliasTable = buildAliasTable();

// Pre-sorted alias rows: [alias_lower, canonical, word_count, char_length]
export const SORTED_ALIASES: [string, string, number, number][] = (() => {
  const rows: [string, string, number, number][] = [];
  for (const canon of Object.keys(ALIAS_TABLE)) {
    for (const a of ALIAS_TABLE[canon].aliases) {
      const al = a.toLowerCase();
      rows.push([al, canon, al.split(/\s+/).length, al.length]);
    }
  }
  rows.sort((a, b) => b[2] - a[2] || b[3] - a[3]);
  return rows;
})();
