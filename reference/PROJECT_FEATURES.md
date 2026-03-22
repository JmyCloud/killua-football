# Killua Football GPT — دليل المميزات الشامل

## نظرة عامة

مشروع تحليل كرة قدم احترافي مبني على **Next.js App Router** متصل بـ **SportMonks API v3** مع **Custom GPT** كواجهة تحليل ذكية. يقدم تحليلاً شاملاً لأي مباراة بضغطة واحدة من المستخدم.

---

## البنية التقنية

| المكون | التقنية |
|--------|---------|
| Framework | Next.js 14 (App Router) |
| Database | PostgreSQL (Supabase) |
| Data Source | SportMonks Football API v3 |
| AI Interface | OpenAI Custom GPT |
| Hosting | Vercel (Hobby Plan) |
| Scheduling | Cloudflare Workers (Durable Objects) |
| Caching | Stale-While-Revalidate مع Advisory Locks |

---

## الـ Endpoints المتاحة للـ GPT (8 endpoints)

| # | Method | Endpoint | الوظيفة |
|---|--------|----------|---------|
| 1 | GET | `/fixtures` | البحث عن المباريات (قادمة/مباشرة/منتهية) |
| 2 | GET | `/leagues` | تصفح الدوريات المتاحة |
| 3 | POST | `/fixtures/{id}/prepare` | مزامنة كل بيانات المباراة (19 pack) |
| 4 | GET | `/fixtures/{id}/manifest` | جاهزية الـ packs وترتيب القراءة |
| 5 | GET | `/fixtures/{id}/packs/{pack}` | قراءة pack بيانات واحد |
| 6 | GET | `/markets?search=keyword` | البحث عن أسواق الرهان |
| 7 | GET | `/fixtures/{id}/odds/pre-match` | أسعار ما قبل المباراة (1xBet) |
| 8 | GET | `/fixtures/{id}/odds/inplay` | أسعار أثناء المباراة (1xBet) |

---

## حزم البيانات (19 Analysis Pack)

### حزم المباراة الأساسية (5)
| Pack | البيانات | الـ Includes |
|------|----------|-------------|
| `fixture_context` | الدوري، الموسم، المرحلة، الجولة، المكان، الطقس، المجموعة، المجمع | league;season;stage;round;group;aggregate;venue;state;weatherReport;metadata |
| `fixture_squads` | التشكيلات، التشكيلة الأساسية، المدربين، الإصابات والإيقافات | formations;lineups.player;lineups.detailedPosition;lineups.details.type;coaches;sidelined.sideline.player;sidelined.sideline.type |
| `fixture_events_scores` | الأهداف، البطاقات، التبديلات، مجريات المباراة | scores.type;events.type |
| `fixture_statistics` | الإحصائيات التفصيلية (تسديدات، استحواذ، تمريرات، مبارزات) | statistics.type |
| `fixture_periods` | إحصائيات الشوط الأول والثاني بشكل منفصل | periods.type;periods.statistics.type |

### حزم بريميوم جديدة (5)
| Pack | البيانات | الـ Includes |
|------|----------|-------------|
| `fixture_xg` | الأهداف المتوقعة (xG) لكل فريق — مقارنة xG بالأهداف الفعلية | type;participant |
| `fixture_predictions` | احتمالات الفوز/التعادل/الخسارة + رهانات القيمة | probabilities + value_bets (self-contained) |
| `fixture_news` | أخبار ما قبل المباراة — تحديثات تكتيكية وإصابات | pre-match/upcoming مع فلترة بالمباراة |
| `fixture_expected_lineups` | التشكيلة المتوقعة قبل الإعلان الرسمي | type;fixture;participant |
| `fixture_transfer_rumours` | شائعات الانتقالات — اللاعبون المرتبطون بالفريقين | player;type;fromTeam;toTeam;position |

### حزم المواجهات المباشرة (4)
| Pack | البيانات | الـ Includes |
|------|----------|-------------|
| `h2h_context` | ملخص المواجهات، المشاركون، النتائج | league;season;stage;round;group;aggregate;venue;state;participants;scores.type;formations;coaches |
| `h2h_events` | أحداث المواجهات السابقة (أهداف، بطاقات) | events.type |
| `h2h_statistics` | إحصائيات المواجهات السابقة | statistics.type;periods.type |
| `h2h_referees` | حكام المواجهات السابقة | referees.referee;referees.type |

### حزم إحصائيات الفرق والحكم (3)
| Pack | البيانات | الـ Includes |
|------|----------|-------------|
| `home_team_all` | إحصائيات الفريق المضيف (هجوم، دفاع، تمرير، بدني، متقدم، فورم) | season;team |
| `away_team_all` | إحصائيات الفريق الضيف (نفس التفصيل) | season;team |
| `referee_all` | إحصائيات الحكم (بطاقات، ركلات جزاء، VAR، تسامح) | season;referee |

### حزمة ترتيب الدوري (1)
| Pack | البيانات | الـ Includes |
|------|----------|-------------|
| `league_standings` | ترتيب الدوري — المراكز، النقاط، الفوز/التعادل/الخسارة، الأهداف، الفورم، ديار/خارج | participant;season;league;stage;round;group;rule;details.type;form |

### حزم الأسعار (2)
| Pack | البيانات | الـ Includes |
|------|----------|-------------|
| `odds_prematch_summary` | ملخص أسعار ما قبل المباراة — خريطة الأسواق | market |
| `odds_inplay_summary` | ملخص أسعار أثناء المباراة (للمباريات المباشرة فقط) | market |

---

## نظام المزامنة (Sync Architecture)

### تدفق التحضير (Prepare Flow)
```
POST /prepare → sync fixture → read manifest → discover teams/referee/season
  ├── Batch 1 (parallel): H2H + Home Stats + Away Stats + Referee Stats + Standings
  ├── Batch 2 (parallel): xG + Predictions + News + Expected Lineups + Transfer Rumours
  └── Batch 3 (parallel): Pre-match Odds + Inplay Odds (if live)
→ Final manifest with readiness status
```

### التخزين المؤقت (Caching)
- **Stale-While-Revalidate**: يقدم بيانات قديمة فوراً ويحدث في الخلفية
- **Advisory Locks**: يمنع طلبات التحديث المتزامنة
- **TTL مخصص**: لكل نوع بيانات TTL مختلف (المباريات المباشرة أقصر)
- **3 أوضاع تحديث**: `swr` | `fresh_if_stale` | `force_fresh`

### جداول التخزين (Cache Tables)
| الجدول | البيانات |
|--------|----------|
| `fixtures_raw` | بيانات المباراة الخام |
| `fixtures_head_to_head_raw` | مواجهات مباشرة |
| `statistics_seasons_teams_raw` | إحصائيات الفرق |
| `statistics_seasons_referees_raw` | إحصائيات الحكام |
| `odds_prematch_fixtures_bookmakers_35_raw` | أسعار ما قبل المباراة |
| `odds_inplay_fixtures_bookmakers_35_raw` | أسعار أثناء المباراة |
| `odds_markets_raw` | تعريفات الأسواق |
| `fixture_xg_raw` | بيانات xG |
| `fixture_predictions_raw` | التنبؤات |
| `fixture_news_raw` | الأخبار |
| `fixture_expected_lineups_raw` | التشكيلات المتوقعة |
| `fixture_transfer_rumours_raw` | شائعات الانتقالات |
| `standings_seasons_raw` | ترتيب الدوري حسب الموسم |

---

## نظام القراءة الآمن (Safe Read)

- **الغرض**: منع الـ GPT من استقبال ردود ضخمة تتجاوز حدوده
- **كيف يعمل**: `read_mode=safe` يقسم البيانات لصفحات بحجم محدد
- **التنقل**: `page=1&page_size=25` مع `has_next_page` للتنقل
- **لكل pack**: حجم صفحة افتراضي وأقصى مختلف

---

## نظام الأسعار (Odds System)

- **المصدر الحصري**: 1xBet (Bookmaker ID 35)
- **نوعان**: Pre-match + Inplay (للمباريات المباشرة)
- **البحث عن أسواق**: `/markets?search=keyword` للبحث بالاسم
- **الفلترة**: `filter=market:1,2,5` لاختيار أسواق محددة
- **ملخص + تفصيل**: الـ packs تعطي ملخص، والـ odds endpoints تعطي أسعار فعلية

---

## نظام الجدولة (Cloudflare Workers)

- **Watchlist**: مزامنة تلقائية للمباريات المراقبة كل 4 ساعات
- **Live Tracking**: تحديث أسرع للمباريات المباشرة
- **Durable Objects**: لإدارة الحالة والجدولة
- **CRON_SECRET**: مشترك بين Vercel و Cloudflare Worker

---

## تدفق التحليل الكامل (Analysis Workflow)

```
1. المستخدم يسأل GPT عن مباراة
2. GPT يبحث عن المباراة → GET /fixtures?search=...
3. GPT يحضر البيانات → POST /fixtures/{id}/prepare
4. GPT يقرأ الـ manifest → GET /fixtures/{id}/manifest
5. GPT يقرأ كل pack جاهز بالترتيب (safe_read مع pagination)
6. GPT يختار 3-6 أسواق → GET /markets + GET /odds/pre-match
7. GPT يبحث في الويب عن آخر الأخبار (تكميلي فقط)
8. GPT يحلل كل البيانات → تقرير شامل مع جدول توصيات
```

---

## مميزات الأمان

- **x-gpt-secret**: كل طلبات GPT تحتاج هيدر سري
- **Admin auth**: كل الـ sync routes محمية
- **Input validation**: كل الـ parameters يتم التحقق منها
- **Error handling**: أخطاء واضحة مع error codes
- **Rate limiting**: Advisory locks تمنع التحميل الزائد

---

## ملاحظات مهمة

1. **xG**: متاح عبر SportMonks API مباشرة (pack `fixture_xg`) — لا حاجة لجلبه من الويب
2. **الأسعار**: حصرياً من 1xBet (ID 35) — يتم عرضها دائماً كـ "1xBet" في جدول التوصيات
3. **Premium Packs**: قد لا تكون متاحة لجميع المباريات — GPT يتخطاها بسلاسة
4. **Sample Size**: إحصائيات الفرق/الحكام قد تكون محدودة في بداية الموسم — القيد من SportMonks وليس من الكود
5. **League Standings**: ترتيب الدوري يُجلب تلقائياً عند التحضير — يستخدم `season_id` من بيانات المباراة
6. **OpenAPI Schema**: `public/openapi.json` (v3.3.0) — يعكس كل الـ 19 pack
