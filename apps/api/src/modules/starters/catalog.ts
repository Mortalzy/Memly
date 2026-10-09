import type { StarterDeckDetailDto } from '@memly/contracts';

type StarterDeck = Omit<StarterDeckDetailDto, 'count' | 'addedDeckId'>;
// Authored, version-controlled material: one English expression and one Russian meaning.
const pairs = (text: string): StarterDeck['cards'] =>
  text
    .trim()
    .split('\n')
    .map((line) => {
      const [term, definition] = line.split('|').map((value) => value.trim());
      return { term, definition };
    });

export const starterDecks: readonly StarterDeck[] = [
  {
    key: 'essential-verbs',
    title: 'Основные глаголы',
    description:
      '40 глаголов для первых предложений: действия, желания, общение и повседневные задачи. У каждого слова выбран один распространённый смысл.',
    level: 'Начальный',
    icon: 'Aa',
    cards: pairs(`
be | быть
have | иметь
do | делать
go | идти
come | приходить
get | получать
make | создавать
take | брать
give | давать
put | класть
want | хотеть
need | нуждаться
like | нравиться
love | любить
know | знать
think | думать
understand | понимать
remember | помнить
forget | забывать
say | говорить
tell | рассказывать
ask | спрашивать
answer | отвечать
see | видеть
look | смотреть
hear | слышать
listen | слушать
read | читать
write | писать
speak | разговаривать
learn | учиться
teach | обучать
work | работать
help | помогать
try | пробовать
use | использовать
find | находить
buy | покупать
pay | платить
wait | ждать
`),
  },
  {
    key: 'daily-routine',
    title: 'Повседневные действия',
    description:
      '40 выражений, чтобы рассказать о своём дне: утро, домашние дела, дорога, отдых и привычки. Учите действия сразу в готовых сочетаниях.',
    level: 'Начальный',
    icon: 'book',
    cards: pairs(`
wake up | просыпаться
get up | вставать с постели
make the bed | заправлять кровать
brush your teeth | чистить зубы
wash your face | умываться
take a shower | принимать душ
get dressed | одеваться
have breakfast | завтракать
leave home | выходить из дома
go to work | идти на работу
take the bus | ехать на автобусе
walk to school | идти в школу пешком
start work | начинать работу
check your email | проверять электронную почту
have lunch | обедать
take a break | делать перерыв
finish work | заканчивать работу
go home | идти домой
do the shopping | делать покупки
cook dinner | готовить ужин
set the table | накрывать на стол
have dinner | ужинать
wash the dishes | мыть посуду
do the laundry | стирать бельё
hang out the washing | развешивать бельё для сушки
tidy your room | прибирать свою комнату
take out the rubbish | выносить мусор
water the plants | поливать растения
feed the cat | кормить кошку
walk the dog | выгуливать собаку
do your homework | делать домашнее задание
watch a film | смотреть фильм
listen to music | слушать музыку
read a book | читать книгу
go for a walk | идти на прогулку
meet friends | встречаться с друзьями
exercise | заниматься физическими упражнениями
relax | отдыхать
go to bed | ложиться спать
fall asleep | засыпать
`),
  },
  {
    key: 'people-feelings',
    title: 'Люди и эмоции',
    description:
      '40 слов для описания характера, настроения и состояния человека. Подходят для знакомства, переписки и рассказов о себе.',
    level: 'Начальный',
    icon: 'leaf',
    cards: pairs(`
happy | счастливый
sad | грустный
angry | сердитый
tired | уставший
hungry | голодный
thirsty | испытывающий жажду
bored | скучающий
excited | воодушевлённый
worried | обеспокоенный
nervous | нервничающий
calm | спокойный
surprised | удивлённый
scared | испуганный
lonely | одинокий
proud | гордый
disappointed | разочарованный
confused | растерянный
grateful | благодарный
hopeful | полный надежды
comfortable | чувствующий себя комфортно
kind | добрый
friendly | дружелюбный
polite | вежливый
rude | грубый
honest | честный
patient | терпеливый
shy | застенчивый
confident | уверенный в себе
generous | щедрый
reliable | надёжный
helpful | готовый помочь
careful | осторожный
curious | любознательный
creative | творческий
lazy | ленивый
hard-working | трудолюбивый
funny | забавный
serious | серьёзный
quiet | тихий
talkative | разговорчивый
`),
  },
  {
    key: 'food-cafe',
    title: 'Еда и кафе',
    description:
      '40 слов для меню и заказа еды: продукты, блюда, вкусы и обслуживание. Названия предметов и ингредиентов даны в контексте еды.',
    level: 'Начальный',
    icon: 'leaf',
    cards: pairs(`
bread | хлеб
rice | рис
pasta | макароны
potato | картофель
onion | лук
tomato | помидор
carrot | морковь
cheese | сыр
butter | сливочное масло
milk | молоко
egg | яйцо
chicken | куриное мясо
beef | говядина
fish | рыба
apple | яблоко
banana | банан
orange | апельсин
strawberry | клубника
water | вода
juice | сок
tea | чай
coffee | кофе
soup | суп
salad | салат
sandwich | бутерброд
dessert | десерт
menu | меню
waiter | официант
bill | счёт в ресторане
tip | чаевые
table | стол
fork | вилка
spoon | ложка
knife | нож
plate | тарелка
glass | стакан
delicious | очень вкусный
spicy | острый на вкус
sweet | сладкий
salty | солёный
`),
  },
  {
    key: 'city-directions',
    title: 'Город и дорога',
    description:
      '40 слов и выражений, чтобы ориентироваться в городе: транспорт, нужные места и указания маршрута. Значения относятся к дороге и городской среде.',
    level: 'Начальный',
    icon: 'book',
    cards: pairs(`
street | улица
road | дорога
crossroads | перекрёсток
traffic lights | светофор
pedestrian crossing | пешеходный переход
pavement | тротуар
bridge | мост
square | площадь
park | парк
bus stop | автобусная остановка
train station | железнодорожная станция
underground station | станция метро
airport | аэропорт
car park | парковка
entrance | вход
exit | выход
supermarket | супермаркет
pharmacy | аптека
hospital | больница
bank | банк
post office | почтовое отделение
library | библиотека
museum | музей
cinema | кинотеатр
police station | полицейский участок
town centre | центр города
turn left | поверните налево
turn right | поверните направо
go straight on | идите прямо
cross the road | перейдите дорогу
on the corner | на углу
next to | рядом с
opposite | напротив
between | между
behind | позади
in front of | перед
nearby | поблизости
far away | далеко
one-way street | улица с односторонним движением
return ticket | билет туда и обратно
`),
  },
  {
    key: 'travel-hotel',
    title: 'Путешествия и отель',
    description:
      '40 слов для аэропорта, бронирования и проживания в отеле. Помогут понять документы, табло и условия размещения.',
    level: 'Базовый',
    icon: 'book',
    cards: pairs(`
passport | паспорт
visa | виза
boarding pass | посадочный талон
flight | авиарейс
departure | отправление
arrival | прибытие
gate | выход на посадку
terminal | терминал
luggage | багаж
suitcase | чемодан
hand luggage | ручная кладь
baggage claim | зона выдачи багажа
security check | проверка безопасности
customs | таможня
delayed | задержанный
cancelled | отменённый
connection | пересадка
destination | пункт назначения
aisle seat | место у прохода
window seat | место у окна
reservation | бронирование
reception | стойка регистрации
single room | одноместный номер
double room | номер с двуспальной кроватью
twin room | номер с двумя отдельными кроватями
room key | ключ от номера
check-in | регистрация заезда
check-out | оформление выезда
breakfast included | завтрак включён
available | доступный
fully booked | полностью забронированный
lift | лифт
towel | полотенце
blanket | одеяло
air conditioning | кондиционирование воздуха
travel insurance | туристическая страховка
exchange rate | обменный курс
local currency | местная валюта
guided tour | экскурсия с гидом
emergency | чрезвычайная ситуация
`),
  },
  {
    key: 'work-study',
    title: 'Работа и учёба',
    description:
      '40 слов для занятий, офиса и планирования: задания, проекты, встречи и поиск работы. Значения выбраны для учебного и рабочего контекста.',
    level: 'Базовый',
    icon: 'layers',
    cards: pairs(`
job | работа по найму
company | компания
office | офис
colleague | коллега
manager | руководитель
employee | сотрудник
employer | работодатель
customer | покупатель
salary | зарплата
experience | опыт
skill | навык
CV | резюме
interview | собеседование
meeting | рабочая встреча
schedule | расписание
deadline | крайний срок
task | задача
project | проект
report | отчёт
presentation | презентация
feedback | обратная связь
appointment | назначенная встреча
training | профессиональное обучение
team | команда
university | университет
course | учебный курс
subject | учебный предмет
lesson | урок
lecture | лекция
exam | экзамен
grade | оценка
homework | домашнее задание
textbook | учебник
notebook | тетрадь
dictionary | словарь
notes | записи
research | исследование
essay | эссе
mistake | ошибка
progress | прогресс
`),
  },
  {
    key: 'conversation-phrases',
    title: 'Разговорные фразы',
    description:
      '40 готовых реплик для знакомства, вежливых просьб и поддержания разговора. Вопросы и ответы можно сразу применять в общении.',
    level: 'Базовый',
    icon: 'Aa',
    cards: pairs(`
How are you? | Как дела?
Nice to meet you. | Приятно познакомиться.
Where are you from? | Откуда вы?
What do you do? | Кем вы работаете?
How was your day? | Как прошёл ваш день?
What do you mean? | Что вы имеете в виду?
Could you repeat that? | Не могли бы вы повторить?
Could you speak more slowly? | Не могли бы вы говорить медленнее?
I don't understand. | Я не понимаю.
How do you spell that? | Как это пишется по буквам?
What does this word mean? | Что означает это слово?
How do you say this in English? | Как это сказать по-английски?
I'm learning English. | Я учу английский.
Could you help me? | Не могли бы вы мне помочь?
Excuse me. | Извините, пожалуйста.
I'm sorry I'm late. | Простите за опоздание.
Thank you for your help. | Спасибо за вашу помощь.
You're welcome. | Не за что.
No problem. | Без проблем.
Don't worry. | Не волнуйтесь.
That's a good idea. | Это хорошая идея.
I agree with you. | Я с вами согласен.
I'm not sure. | Я не уверен.
I think so. | Думаю, да.
I don't think so. | Думаю, нет.
It depends. | Зависит от обстоятельств.
That sounds great. | Звучит отлично.
I'd love to. | С удовольствием.
Maybe next time. | Может быть, в следующий раз.
I'm afraid I can't. | Боюсь, я не смогу.
Could I ask a question? | Можно задать вопрос?
Let me think. | Дайте подумать.
Just a moment. | Один момент.
Take your time. | Не торопитесь.
What about you? | А вы?
See you later. | Увидимся позже.
Have a nice day. | Хорошего дня.
Take care. | Берегите себя.
Keep in touch. | Оставайтесь на связи.
Let's keep going. | Давайте продолжим.
`),
  },
  {
    key: 'phrasal-verbs',
    title: 'Фразовые глаголы',
    description:
      '40 распространённых фразовых глаголов в конкретном значении. Короткий контекст отличает многозначные выражения и помогает использовать их в речи.',
    level: 'Средний',
    icon: 'layers',
    cards: pairs(`
turn on the light | включить свет
turn off the TV | выключить телевизор
turn up the volume | увеличить громкость
turn down the music | сделать музыку тише
put on a coat | надеть пальто
take off your shoes | снять обувь
try on a jacket | примерить куртку
look for your keys | искать свои ключи
look after a child | присматривать за ребёнком
look up a word | найти слово в словаре
look forward to the holiday | с нетерпением ждать отпуска
get on the bus | сесть в автобус
get off the train | выйти из поезда
get in the car | сесть в машину
get out of the taxi | выйти из такси
pick up a parcel | забрать посылку
drop off a friend | подвезти друга до места назначения
find out the truth | выяснить правду
fill in a form | заполнить форму
hand in your homework | сдать домашнее задание
give up smoking | бросить курить
carry on working | продолжать работать
run out of milk | остаться без молока
come back home | вернуться домой
go out with friends | пойти куда-нибудь с друзьями
eat out | поесть вне дома
grow up | повзрослеть
calm down | успокоиться
cheer up | приободриться
break down | сломаться
work out a solution | найти решение
set up a company | основать компанию
put off a meeting | отложить встречу
call off an event | отменить мероприятие
bring up a topic | поднять тему
come across an old photo | случайно наткнуться на старую фотографию
throw away the rubbish | выбросить мусор
sort out a problem | разобраться с проблемой
get along with colleagues | ладить с коллегами
catch up with a friend | обменяться новостями с другом
`),
  },
  {
    key: 'useful-collocations',
    title: 'Полезные сочетания',
    description:
      '40 устойчивых сочетаний, которые помогают говорить естественнее: make/do, решения, планы, время, общение и обычные жизненные ситуации.',
    level: 'Средний',
    icon: 'Aa',
    cards: pairs(`
make a decision | принять решение
make a mistake | допустить ошибку
make a promise | дать обещание
make an effort | приложить усилие
make friends | подружиться
make progress | добиться прогресса
make a difference | повлиять на ситуацию
do your best | сделать всё возможное
do someone a favour | оказать кому-то услугу
do business | вести дела
take a chance | рискнуть
take responsibility | взять на себя ответственность
take notes | делать записи
take part | принять участие
take a photo | сделать фотографию
have a conversation | поговорить
have a good time | хорошо провести время
have a look | взглянуть
have a rest | отдохнуть
have something in common | иметь что-то общее
keep a promise | сдержать обещание
keep a secret | хранить секрет
keep in mind | иметь в виду
keep calm | сохранять спокойствие
pay attention | обратить внимание
save time | сэкономить время
waste time | потратить время впустую
spend money | тратить деньги
save money | откладывать деньги
earn money | зарабатывать деньги
catch a cold | простудиться
miss the bus | опоздать на автобус
meet a deadline | уложиться в срок
solve a problem | решить проблему
ask for advice | попросить совета
give advice | дать совет
tell the truth | сказать правду
tell a lie | солгать
heavy rain | сильный дождь
strong coffee | крепкий кофе
`),
  },
];
