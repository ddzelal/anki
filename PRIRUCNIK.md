# Ulum — Arapske kartice · Priručnik za administratora sadržaja

Studenti uče arapske reči karticama koje se otvaraju iz Moodle-a. Kao administrator
sadržaja upravljaš **samo na dva mesta**:

- **Google Sheet** — reči, lekcije, uključeno/isključeno, i ko koju reč vidi
- **Moodle grupe** — koji student je u kojoj grupi

Nema baze, nema koda, nema „sinhronizacije“. Ono što upišeš u Sheet je odmah izvor istine.

---

## 1. Google Sheet — tab `CardsV2`

Svaki red = jedna kartica. Kolone:

| Kolona | Šta znači |
|---|---|
| `front` | Prednja strana kartice (npr. arapska reč) |
| `back` | Poleđina — prevod / odgovor |
| `lesson` | Oznaka lekcije, npr. `Lekcija 1`. Ako ostaviš prazno, red **nasleđuje** lekciju iz reda iznad |
| `isActive` | `TRUE` ili prazno = kartica se prikazuje. `FALSE` = privremeno sakrivena **svima** (isključi bez brisanja) |
| kolone za grupe (od kolone **E** nadalje) | Svaka kolona je jedna Moodle grupa. **Ime kolone (red 1) mora biti tačno ime grupe iz Moodle-a.** Kvačica ✓ u ćeliji = ta reč je vidljiva toj grupi |

> 💡 Za dodavanje reči samo dopiši nove redove. Za novu grupu — dodaj novu kolonu i u red 1
> upiši ime grupe. (Ako nova kolona nema kvačice-widget, javi IT-ju da pokrene `pnpm checkboxes` — jednom.)

---

## 2. NAJVAŽNIJE pravilo: ko vidi koju reč

Student vidi reč ako je **aktivna** (`isActive`) **I** važi jedno od:

- ✅ **Nijedna grupa nije čekirana** za tu reč → vidljiva je **svima** (nema ograničenja)
- ✅ Student je **u nekoj grupi koja JE čekirana** za tu reč
- ❌ Reč je čekirana **samo** za grupe u kojima student **nije** → **ne vidi je**

**Primeri:**
- Red bez ijedne kvačice → svi ga uče.
- Red sa kvačicom samo u koloni `arapski_jezik_decembar_2025` → uče ga **samo** članovi te grupe.

---

## 3. Google Sheet — tab `Settings`

Podešavanja aplikacije u obliku `key | value`. Za sada:

| Ključ | Značenje |
|---|---|
| `new_per_day` | Koliko **novih** reči dnevno dobija svaki student (podrazumevano **10**). Ponavljanja već viđenih reči su **neograničena** |

---

## 4. Moodle — grupe i članstvo

U kursu: **Participants → Groups**. Tu praviš grupe i dodaješ studente u njih.

> 🔗 **Veza Sheet ↔ Moodle je IME grupe.**
> Ime grupe u Moodle-u mora biti **identično** imenu kolone u `CardsV2` — slovo u slovo.
> Npr. grupa `arapski_jezik_decembar_2025` u Moodle-u ↔ kolona `arapski_jezik_decembar_2025` u Sheet-u.

Aplikacija sama pročita u kojim je grupama ulogovani student i pokaže mu odgovarajuće reči.
Student ne mora ništa da radi — samo klikne link u kursu.

---

## 5. Recept: dodavanje nove grupe

1. U Moodle kursu napravi grupu (npr. `arapski_jezik_2026`) i dodaj studente u nju.
2. U Sheet-u `CardsV2` dodaj **novu kolonu**; u red 1 upiši **tačno to isto ime** grupe.
3. Čekiraj ✓ reči koje ta grupa treba da vidi (reči bez kvačice ionako vide svi).
4. Gotovo. Promena je kod studenata za par minuta.

---

## 6. Kad se promene vide + kako student uči

**Kad se vide izmene:** izmene u Sheet-u stižu studentima **za ~5 minuta**, ili **odmah** kad
neko klikne **„Osveži iz Sheet-a“** u aplikaciji (admin meni ≡, ili na `/admin` stranici).

**Kako student uči:** otvori link u Moodle-u → vidi karticu → *Prikaži odgovor* → oceni:
**Ponovo / Teško / Dobro / Lako**. Pametan algoritam (spaced repetition) odlučuje kada se reč
vraća. Napredak (šta je naučeno, „🔥 niz dana“) pamti se po svakom studentu i traje.

---

## 7. Šta NE raditi

- ❌ **Ne menjaj naglo `front`/`back` postojeće reči.** Napredak se veže za sadržaj kartice —
  ako promeniš tekst, aplikacija je tretira kao novu reč (stari napredak za nju se gubi).
  Ispravka sitne greške u kucanju je OK, ali znaj posledicu.
- ❌ **Ne preimenuj Moodle grupu** bez da preimenuješ i kolonu u Sheet-u (i obrnuto) — veza po
  imenu se prekine i grupa prestane da vidi reči.
- ❌ **Ne diraj druge tabove ni bazu.** Radi samo u `CardsV2` i `Settings`.

---

## 🔧 Za IT (jednom, već podešeno)

Aplikacija čita grupe iz Moodle-a preko Web Services tokena (`MOODLE_WS_TOKEN`) i funkcije
`core_group_get_course_user_groups`. Ako se ikad promeni Moodle server ili token istekne,
napravi nov token (External service „Anki groups“) i ubaci ga u Vercel env. Filtriranje po
grupama gase/pale env flag `GROUPS_ENABLED` (`true` = filtrira, `false` = svi vide sve aktivne).
