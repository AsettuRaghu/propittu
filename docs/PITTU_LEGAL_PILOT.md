# Pittu Legal — manual pilot (Basic check)

**Goal:** before we build anything, run the Basic check by hand on the properties already in the
app, to learn (1) what real records turn up that owners didn't know, (2) how long each step takes,
and (3) which steps are worth automating first. The ECs collected also become test material for
Pittu's EC reading.

**Who:** someone on the team with a laptop, per property about 45–90 minutes the first time.
**Never** store anyone's government login or OTP in Propittu; use the team's own portal accounts.

---

## Before you start (once)

- [ ] Register a team account on **Kaveri 2** (Karnataka): kaveri2.karnataka.gov.in → Register (name,
      email, team mobile number).
- [ ] Bookmark **IGRS Telangana**: registration.telangana.gov.in → Online Services.
- [ ] Bookmark **Bhoomi RTC** (Karnataka land records), **Bhu Bharati** (Telangana land records),
      **BBMP e-Khata** (Bengaluru), **eCourts**: services.ecourts.gov.in.
- [ ] Ask the Kaveri helpdesk (by email or phone) and note the answer: *"May a company account apply
      for ECs on behalf of its customers?"*

## For each property

Copy this block per property. Take details from the property page in the Backoffice portal
(Customers → the customer → the property) and from the sale deed in Documents.

```
Property:                              Customer:
State / district / taluk / village:
Survey no. / sub-registrar office:      Deed registration no. and date:
Owner names on the deed:
```

### 1. Encumbrance Certificate (EC), 30 years
- [ ] Karnataka: Kaveri 2 → Encumbrance Certificate → district, taluk, village, survey no., period
      (30 years) → OTP → view and **download the free EC PDF**.
      Telangana: IGRS → Encumbrance Search → by survey no. (or document no.) → 30 years.
- [ ] Keep the PDF in a shared pilot folder named after the property (and, for our own test
      properties, also add it in the app under Documents → Encumbrance certificate).
- [ ] Note: time taken ____ min · problems (captcha, village name not found, portal down) ______

Read it and note:
- [ ] Is the **latest sale to our customer**? Same names as the deed? ____
- [ ] Is the ownership chain unbroken over 30 years (each seller was the earlier buyer)? ____
- [ ] Any **mortgage** not shown as released? ____
- [ ] Any entry **after** the customer bought (sale, mortgage, agreement, court attachment)? ____
- [ ] Anything else unusual? ____

### 2. Land record (RTC / Pahani) and Khata
- [ ] Karnataka: Bhoomi RTC by survey no. → owner name, extent, land type.
      Telangana: Bhu Bharati by survey no.
- [ ] Does the **owner name** match our customer? ____ Does the **area** match the deed? ____
- [ ] Bengaluru properties: BBMP e-Khata → Khata in the customer's name? ____
- [ ] Note: time taken ____ min

### 3. Court cases (eCourts)
- [ ] services.ecourts.gov.in → Case status → Party name → the district (and the nearest city
      courts) → each owner name from the deed, and the seller's name.
- [ ] Note any case with matching names: case no., court, year, status, and whether it's clearly
      about this property, possibly, or a different person. ____
- [ ] Note: time taken ____ min · how many results were just the same name, different person? ____

### 4. Government value
- [ ] Karnataka: Kaveri 2 guidance value for the village/area. Telangana: IGRS market value by
      survey no. (no login).
- [ ] Price paid (deed) ____ · government value today ____ per ____

### 5. Result
- [ ] Overall: **Green** (all clear on what we checked) · **Amber** (something to look into) ·
      **Red** (needs action now)
- [ ] What would we tell the owner, in one or two plain sentences? ______
- [ ] Which Propittu service would fix it (Khata transfer, document verification, site visit, legal
      help)? ______
- [ ] Would the owner have paid ₹2,000 for this? Why / why not? ______
- [ ] Total time for this property ____ min

---

## Trying Pittu on the ECs (optional, as you go)

For our own test properties: upload the EC in the app under Documents → *Encumbrance Certificate (EC)*
(after the next app update), then in the Backoffice portal open the property → the EC → **Read with
Pittu** → **Show what Pittu read**, and compare its list of entries with the PDF. Note anything it
missed or got wrong — that is exactly what we need to improve it.

## At the end of the pilot (send me this)

1. The table of results (one row per property: green/amber/red, the finding, time taken per step).
2. The downloaded EC PDFs (from the shared pilot folder).
3. The Kaveri helpdesk answer.
4. Which step was the slowest or most annoying — that's what we automate first.
