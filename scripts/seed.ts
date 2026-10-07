/**
 * Fills an empty database with realistic test contacts and notes.
 *
 * Safe to run more than once: when the contacts table already has rows,
 * the script exits without touching anything.
 *
 * Usage: pnpm db:seed
 */
import { fakerRU as faker } from "@faker-js/faker";
import { loadEnvConfig } from "@next/env";
import { count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getDatabaseUrl } from "../src/db/database-url";
import {
  contacts,
  notes,
  type NewContact,
  type NewNote,
} from "../src/db/schema";

loadEnvConfig(process.cwd());

const CONTACT_COUNT = 1000;
const RANDOM_SEED = 42;
const INSERT_CHUNK_SIZE = 500;

type Sex = "male" | "female";

const MALE_FIRST_NAMES = [
  "Александр", "Алексей", "Андрей", "Антон", "Артём", "Борис", "Вадим",
  "Василий", "Виктор", "Виталий", "Владимир", "Владислав", "Всеволод", "Глеб",
  "Григорий", "Даниил", "Денис", "Дмитрий", "Евгений", "Егор", "Иван", "Игорь",
  "Илья", "Кирилл", "Константин", "Лев", "Леонид", "Максим", "Марк", "Матвей",
  "Михаил", "Никита", "Николай", "Олег", "Павел", "Пётр", "Роман", "Руслан",
  "Семён", "Сергей", "Станислав", "Степан", "Тимофей", "Тимур", "Фёдор",
  "Юрий", "Ярослав",
];

const FEMALE_FIRST_NAMES = [
  "Алёна", "Алина", "Алиса", "Анастасия", "Анна", "Ангелина", "Валентина",
  "Валерия", "Вера", "Вероника", "Виктория", "Галина", "Дарья", "Диана", "Ева",
  "Евгения", "Екатерина", "Елена", "Елизавета", "Жанна", "Ирина", "Карина",
  "Кира", "Ксения", "Лариса", "Лидия", "Людмила", "Маргарита", "Марина",
  "Мария", "Милана", "Надежда", "Наталья", "Нина", "Оксана", "Ольга", "Полина",
  "Светлана", "София", "Таисия", "Татьяна", "Ульяна", "Юлия", "Яна",
];

const TECH_PLACES = [
  "в Яндексе", "в Сбере", "в Т-Банке", "в Ozon", "в Авито", "в VK",
  "в Лаборатории Касперского", "в 2ГИС", "в Контуре", "в стартапе",
];

const PROFESSIONS: { role: string; places: string[] }[] = [
  { role: "продакт-менеджер", places: TECH_PLACES },
  { role: "бэкенд-разработчик", places: TECH_PLACES },
  { role: "фронтенд-разработчик", places: TECH_PLACES },
  { role: "дизайнер интерфейсов", places: [...TECH_PLACES, "на фрилансе"] },
  { role: "аналитик данных", places: TECH_PLACES },
  { role: "тимлид", places: TECH_PLACES },
  { role: "QA-инженер", places: TECH_PLACES },
  { role: "HR-менеджер", places: TECH_PLACES },
  { role: "юрист", places: ["в юридической фирме", "в Сбере", "в частной практике"] },
  { role: "бухгалтер", places: ["на аутсорсе", "в строительной компании"] },
  { role: "стоматолог", places: ["в частной клинике", "в клинике на Соколе"] },
  { role: "врач-терапевт", places: ["в поликлинике", "в частной клинике"] },
  { role: "риелтор", places: ["в агентстве недвижимости", "в Этажах"] },
  { role: "фотограф", places: ["на фрилансе", "в своей студии"] },
  { role: "тренер по плаванию", places: ["в бассейне «Чайка»", "в фитнес-клубе"] },
  { role: "преподаватель английского", places: ["в языковой школе", "в онлайн-школе"] },
  { role: "маркетолог", places: ["в Ozon", "в рекламном агентстве", "в Wildberries"] },
  { role: "финансовый консультант", places: ["в Т-Банке", "в своей компании"] },
  { role: "архитектор", places: ["в архитектурном бюро", "в своей мастерской"] },
  { role: "журналист", places: ["в РБК", "на фрилансе"] },
  { role: "психолог", places: ["в частной практике", "в онлайн-сервисе"] },
  { role: "шеф-повар", places: ["в ресторане на Патриках", "в кафе у дома"] },
  { role: "учитель математики", places: ["в школе №57", "в лицее"] },
  { role: "ветеринар", places: ["в ветклинике"] },
  { role: "переводчик", places: ["на фрилансе", "в бюро переводов"] },
  { role: "инженер-строитель", places: ["в девелоперской компании"] },
  { role: "основатель стартапа", places: ["в сфере EdTech", "в сфере FinTech"] },
  { role: "автомеханик", places: ["в сервисе на Варшавке"] },
];

const RELATIONS: [male: string, female: string][] = [
  ["Бывший коллега", "Бывшая коллега"],
  ["Друг детства", "Подруга детства"],
  ["Однокурсник", "Однокурсница"],
  ["Одноклассник", "Одноклассница"],
  ["Сосед по дому", "Соседка по дому"],
  ["Знакомый по спортзалу", "Знакомая по спортзалу"],
  ["Партнёр по проекту", "Партнёр по проекту"],
  ["Наставник", "Наставница"],
  ["Бывший руководитель", "Бывший руководитель"],
  ["Друг брата", "Подруга сестры"],
  ["Клиент", "Клиентка"],
];

const CONFERENCES = [
  "HighLoad++", "Podlodka Crew", "ProductCamp", "TeamLead Conf", "Яндекс Скейл",
  "HolyJS", "Design Prosmotr", "AgileDays",
];
const UNIVERSITIES = ["МГУ", "ВШЭ", "МФТИ", "СПбГУ", "Бауманке", "УрФУ", "НГУ", "РЭУ"];
const WORKPLACES = [
  "Яндексе", "Сбере", "Т-Банке", "Ozon", "Авито", "VK", "Альфа-Банке", "МТС",
  "2ГИС", "Контуре",
];
const HIKES = ["Алтай", "Байкал", "Эльбрус", "Кольский", "Камчатку", "Хибины"];
const CITIES = [
  "Казань", "Санкт-Петербург", "Екатеринбург", "Новосибирск", "Сочи",
  "Калининград", "Тбилиси", "Ереван", "Белград", "Алматы",
];
const SPORTS = ["бег", "плавание", "йога", "футбол", "скалолазание", "теннис"];

const HOW_WE_MET: ((sex: Sex) => string)[] = [
  () => `Конференция ${pick(CONFERENCES)}, ${year(2016, 2026)}`,
  () => `Учились вместе в ${pick(UNIVERSITIES)}`,
  () => `Работали вместе в ${pick(WORKPLACES)}`,
  () => `Вместе ходили в поход на ${pick(HIKES)}`,
  () => "Соседи по даче",
  () => "Соседи по подъезду",
  () => `Ходим в одну секцию: ${pick(SPORTS)}`,
  () => "Познакомились на свадьбе у друзей",
  () => `Общий знакомый — ${fullName(randomSex())}`,
  () => "Родители одноклассников сына",
  () => "Жили в одном дворе в детстве",
  () => "Курсы английского",
  () => "Курсы фотографии",
  () => "Волонтёрили вместе в фонде",
  () => "Работали в одном коворкинге",
  () => `Познакомились в поезде Москва — ${pick(CITIES)}`,
  () => "Чат выпускников школы",
  (sex) => (sex === "male" ? "Был моим преподавателем" : "Была моим преподавателем"),
  (sex) => (sex === "male" ? "Был заказчиком на фрилансе" : "Была заказчицей на фрилансе"),
  () => `Митап в ${pick(CITIES)}, ${year(2018, 2026)}`,
];

const TOPICS = [
  "переезд", "новую работу", "ремонт квартиры", "поездку в Грузию",
  "идею совместного проекта", "поступление ребёнка в школу", "запуск своего бизнеса",
  "инвестиции", "покупку машины", "отпуск на Алтае", "курсы по программированию",
  "смену профессии",
];
const WHEN = [
  "на следующей неделе", "в конце месяца", "после праздников", "весной",
  "летом", "когда вернётся из отпуска", "в начале следующего месяца",
];
const SPECIALISTS = [
  "юриста по недвижимости", "хорошего стоматолога", "бухгалтера для ИП",
  "детского врача", "автомеханика", "репетитора по математике",
  "дизайнера интерьеров", "надёжного риелтора",
];
const BOOKS = [
  "Думай медленно, решай быстро", "Мастер и Маргарита", "Sapiens",
  "Чистый код", "Пикник на обочине", "Atomic Habits", "Понедельник начинается в субботу",
];
const MONTHS_IN = [
  "в январе", "в феврале", "в марте", "в апреле", "в мае", "в июне", "в июле",
  "в августе", "в сентябре", "в октябре", "в ноябре", "в декабре",
];
const KIDS_ACTIVITIES = ["футбол", "шахматы", "художку", "бассейн", "музыкалку"];

const NEWS: ((sex: Sex) => string)[] = [
  () => "переходит в новую компанию",
  () => "ждут второго ребёнка",
  () => "купили дом за городом",
  () => "запускает свой стартап",
  (sex) => (sex === "male" ? "пробежал первый марафон" : "пробежала первый марафон"),
  () => `собирается переехать в ${pick(CITIES)}`,
  (sex) => (sex === "male" ? "женится летом" : "выходит замуж летом"),
  (sex) => (sex === "male" ? "закончил ремонт" : "закончила ремонт"),
  (sex) => (sex === "male" ? "начал учить испанский" : "начала учить испанский"),
  (sex) =>
    `${sex === "male" ? "взял" : "взяла"} годовой отпуск и едет путешествовать`,
];

const NOTE_TEMPLATES: ((sex: Sex) => string)[] = [
  () =>
    `Созвонились, обсудили ${pick(TOPICS)}. Договорились встретиться ${pick(WHEN)}.`,
  (sex) =>
    `${sex === "male" ? "Обещал" : "Обещала"} прислать контакты ${pick(SPECIALISTS)}.`,
  (sex) =>
    `Встретились на кофе. ${sex === "male" ? "Рассказал" : "Рассказала"}, что ${pick(NEWS)(sex)}.`,
  () => `Договорились созвониться ${pick(MONTHS_IN)} и обсудить ${pick(TOPICS)}.`,
  () => `Нужно вернуть книгу «${pick(BOOKS)}».`,
  (sex) =>
    `Обсудили совместный проект. Жду от ${sex === "male" ? "него" : "неё"} предложение до конца месяца.`,
  (sex) =>
    `${sex === "male" ? "Посоветовал" : "Посоветовала"} книгу «${pick(BOOKS)}» — обязательно прочитать.`,
  () =>
    `Дети: ${pick(MALE_FIRST_NAMES)} и ${pick(FEMALE_FIRST_NAMES)}, ходят на ${pick(KIDS_ACTIVITIES)}.`,
  () => "Не любит звонки — лучше писать в мессенджер.",
  (sex) =>
    `${sex === "male" ? "Дал" : "Дала"} контакт ${pick(SPECIALISTS)}: ${fullName(randomSex())}, ${formatPhone(faker.phone.number({ style: "international" }))}.`,
  () => "Отправили друг другу поздравления с Новым годом.",
  () => `День рождения ${pick(MONTHS_IN)} — не забыть поздравить.`,
  (sex) =>
    `${sex === "male" ? "Сменил" : "Сменила"} работу: теперь ${pick(PROFESSIONS).role}.`,
  () => `Ищет ${pick(SPECIALISTS)} — если кого-то узнаю, написать.`,
  () =>
    `Договорились: помогаю с резюме, а взамен — знакомство с ${pick(["CTO", "HR-директором", "основателем"])} своей компании.`,
  () => `Позвать на шашлыки ${pick(MONTHS_IN)}.`,
  () => "Встретились случайно в торговом центре, обменялись новостями.",
  (sex) =>
    `${sex === "male" ? "Переслал" : "Переслала"} вакансию: ${pick(PROFESSIONS).role}. Интересно, надо ответить.`,
  () => `Собираемся вместе на ${pick(CONFERENCES)} в следующем году.`,
  (sex) =>
    `${sex === "male" ? "Попросил" : "Попросила"} рекомендацию для нового работодателя — написать до пятницы.`,
];

function randomSex(): Sex {
  return faker.datatype.boolean() ? "male" : "female";
}

function pick<T>(items: readonly T[]): T {
  return faker.helpers.arrayElement(items);
}

function year(from: number, to: number): number {
  return faker.number.int({ min: from, max: to });
}

function fullName(sex: Sex): string {
  const firstName = pick(sex === "male" ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES);
  return `${firstName} ${faker.person.lastName(sex)}`;
}

/** "+79064511893" -> "+7 906 451-18-93" */
function formatPhone(international: string): string {
  const digits = international.replace(/\D/g, "");
  const match = digits.match(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (!match) return international;
  const [, code, first, second, third] = match;
  return `+7 ${code} ${first}-${second}-${third}`;
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh",
  щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

function transliterate(text: string): string {
  return [...text.toLowerCase()].map((char) => TRANSLIT[char] ?? char).join("");
}

function makeEmail(firstName: string, lastName: string): string {
  const first = transliterate(firstName);
  const last = transliterate(lastName);
  const local = faker.helpers.weightedArrayElement([
    { weight: 30, value: `${first}.${last}` },
    { weight: 20, value: `${first}${last}` },
    { weight: 20, value: `${first}_${last}${faker.number.int({ min: 70, max: 99 })}` },
    { weight: 15, value: `${first[0]}.${last}` },
    { weight: 15, value: `${last}.${first}` },
  ]);
  const domain = faker.helpers.weightedArrayElement([
    { weight: 30, value: "gmail.com" },
    { weight: 25, value: "yandex.ru" },
    { weight: 20, value: "mail.ru" },
    { weight: 10, value: "ya.ru" },
    { weight: 10, value: "icloud.com" },
    { weight: 5, value: "outlook.com" },
  ]);
  return `${local}@${domain}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function makeAbout(sex: Sex): string | null {
  const profession = pick(PROFESSIONS);
  const relation = pick(RELATIONS)[sex === "male" ? 0 : 1];
  return faker.helpers.weightedArrayElement([
    { weight: 35, value: `${capitalize(profession.role)} ${pick(profession.places)}` },
    { weight: 25, value: `${relation}, ${profession.role}` },
    { weight: 20, value: `${relation}, сейчас ${profession.role} ${pick(profession.places)}` },
    { weight: 12, value: relation },
    { weight: 8, value: null },
  ]);
}

function makeContact(now: Date): { contact: NewContact; notes: NewNote[] } {
  const sex = randomSex();
  const firstName = pick(sex === "male" ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES);
  const lastName = faker.person.lastName(sex);

  const createdAt = faker.date.between({
    from: new Date(now.getFullYear() - 3, now.getMonth(), now.getDate()),
    to: now,
  });

  const contact: NewContact = {
    id: faker.string.uuid(),
    name: `${firstName} ${lastName}`,
    about: makeAbout(sex),
    howWeMet: faker.datatype.boolean(0.9) ? pick(HOW_WE_MET)(sex) : null,
    phone: faker.datatype.boolean(0.9)
      ? formatPhone(faker.phone.number({ style: "international" }))
      : null,
    email: faker.datatype.boolean(0.8) ? makeEmail(firstName, lastName) : null,
    createdAt,
    updatedAt: createdAt,
  };

  const noteCount = faker.helpers.weightedArrayElement([
    { weight: 20, value: 0 },
    { weight: 25, value: 1 },
    { weight: 20, value: 2 },
    { weight: 15, value: 3 },
    { weight: 12, value: 4 },
    { weight: 8, value: 6 },
  ]);

  const contactNotes: NewNote[] = Array.from({ length: noteCount }, () => ({
    contactId: contact.id!,
    body: pick(NOTE_TEMPLATES)(sex),
    createdAt: faker.date.between({ from: createdAt, to: now }),
  }));

  return { contact, notes: contactNotes };
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

async function main() {
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  const db = drizzle(pool);

  try {
    const [{ existing }] = await db
      .select({ existing: count() })
      .from(contacts);

    if (existing > 0) {
      console.log(
        `The database already has ${existing} contacts, seeding skipped.`,
      );
      return;
    }

    faker.seed(RANDOM_SEED);
    const now = new Date();
    const contactRows: NewContact[] = [];
    const noteRows: NewNote[] = [];

    for (let i = 0; i < CONTACT_COUNT; i++) {
      const generated = makeContact(now);
      contactRows.push(generated.contact);
      noteRows.push(...generated.notes);
    }

    await db.transaction(async (tx) => {
      for (const rows of chunk(contactRows, INSERT_CHUNK_SIZE)) {
        await tx.insert(contacts).values(rows);
      }
      for (const rows of chunk(noteRows, INSERT_CHUNK_SIZE)) {
        await tx.insert(notes).values(rows);
      }
    });

    console.log(
      `Inserted ${contactRows.length} contacts and ${noteRows.length} notes.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Seeding failed:", error);
  process.exitCode = 1;
});
