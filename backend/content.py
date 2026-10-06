"""Game content for Ward Life GH.

Cases are simplified for teaching and play. They are not clinical guidelines
and contain no drug doses. Have a clinician review every case before launch.
"""

HOSPITAL = "Akwaaba Teaching Hospital"

DEPTS = {
    "ambulance":  {"name": "Ambulance bay",   "icon": "bi-truck",          "blurb": "Dispatch ambulances to referring facilities and 999 calls, receive patients and transfer referrals out."},
    "emergency":  {"name": "Emergency",       "icon": "bi-heart-pulse",    "blurb": "Triage, resuscitate and stabilise the sickest patients. The referral phone rings here."},
    "radiology":  {"name": "Radiology",       "icon": "bi-radioactive",    "blurb": "X-rays, CT and ultrasound. Radiographers run the imaging queue."},
    "lab":        {"name": "Laboratory",      "icon": "bi-droplet-half",   "blurb": "Blood counts, chemistry, cultures and crossmatch."},
    "records":    {"name": "Records & NHIS",  "icon": "bi-folder2-open",   "blurb": "Open folders and check NHIS cards before OPD."},
    "opd":        {"name": "OPD",             "icon": "bi-people",         "blurb": "Outpatients: see, treat and send home safely."},
    "pharmacy":   {"name": "Pharmacy",        "icon": "bi-capsule",        "blurb": "Check every prescription before it is dispensed."},
    "theatre":    {"name": "Theatre",         "icon": "bi-scissors",       "blurb": "Emergency and planned surgery."},
    "maternity":  {"name": "Maternity",       "icon": "bi-gender-female",  "blurb": "Labour ward and maternity beds."},
    "paeds":      {"name": "Paediatrics",     "icon": "bi-balloon",        "blurb": "Children's emergency and ward."},
    "medical":    {"name": "Medical Ward",    "icon": "bi-hospital",       "blurb": "Adult medical inpatients."},
    "surgical":   {"name": "Surgical Ward",   "icon": "bi-bandaid",        "blurb": "Surgical and post-operative patients."},
    "conference": {"name": "Conference room", "icon": "bi-easel",          "blurb": "Clinical meetings and case presentations."},
}

WARDS = ("medical", "surgical", "paeds", "maternity")

# Capacity. Maternity and Paediatrics are both admitting units and wards.
WARD_BEDS = {"medical": 8, "surgical": 8, "paeds": 6, "maternity": 6}
UNIT_CAP = {"emergency": 6, "maternity": 6, "paeds": 6}      # space to receive a referral
OXYGEN_START = 12                                            # cylinders in stock at the start
FLEET = ["Unit 1", "Unit 2", "Unit 3"]                       # National Ambulance Service units based here

# Facilities that refer to us, with their level in the referral system.
REFERRING = [("Ada East CHPS compound", "CHPS compound"), ("Abokobi Health Centre", "Health centre"),
             ("Weija Health Centre", "Health centre"), ("Dodowa District Hospital", "District hospital"),
             ("Nsawam Government Hospital", "District hospital"), ("Amasaman Municipal Hospital", "Municipal hospital"),
             ("Kasoa Polyclinic", "Polyclinic"), ("Prampram Polyclinic", "Polyclinic"),
             ("Eastern Regional Hospital, Koforidua", "Regional hospital")]
# Fictional hospitals we can try when we have no bed or oxygen.
REDIRECT_HOSPITALS = ["Sankofa Regional Hospital", "Adinkra Regional Hospital", "Kente Teaching Hospital"]
# Fictional specialist centres for patients we refer out.
SPECIALIST_CENTRES = {
    "National Burns Centre": ["burns"],
    "Kente Teaching Hospital Burns Unit": ["burns"],
    "National Neurosurgery Centre": ["neuro"],
    "National Cardiothoracic Centre": ["cardio"],
}
# Advice given on the phone when accepting a referral. True = good practice.
ADVICE = [("Start first-line treatment before transfer", True),
          ("Send a referral note with the patient", True),
          ("Send a health worker as escort", True),
          ("Call back if the patient gets worse", True),
          ("Send the patient by taxi to save time", False)]

DISPOSITIONS = {
    "discharge":       "Discharge home",
    "admit_medical":   "Admit to Medical Ward",
    "admit_surgical":  "Admit to Surgical Ward",
    "admit_paeds":     "Admit to Paediatrics",
    "admit_maternity": "Admit to Maternity",
    "theatre":         "Send to theatre",
    "refer_out":       "Refer to a specialist centre",
}
WARD_OF = {"admit_medical": "medical", "admit_surgical": "surgical",
           "admit_paeds": "paeds", "admit_maternity": "maternity"}

LEVELS = [0, 100, 300, 600, 1000, 1600, 2500, 4000, 6000, 9000]

ROLES = {
    "doctor": {"name": "Doctor", "icon": "bi-clipboard2-pulse",
               "does": "Clerk patients, order tests, decide the plan and operate.",
               "ladder": ["House Officer", "Medical Officer", "Senior Medical Officer", "Resident",
                          "Senior Resident", "Specialist", "Senior Specialist", "Consultant"]},
    "student": {"name": "Medical student", "icon": "bi-mortarboard",
                "does": "Clerk and manage patients under supervision, and present cases.",
                "ladder": ["Clinical Student, Year 4", "Clinical Student, Year 5", "Final Year Student",
                           "Prize Candidate", "Dean's List", "Best Graduating Student"]},
    "nurse": {"name": "Nurse", "icon": "bi-heart",
              "does": "Triage, give medicines and keep ward patients safe.",
              "ladder": ["Staff Nurse", "Senior Staff Nurse", "Nursing Officer", "Senior Nursing Officer",
                         "Principal Nursing Officer", "Deputy Director of Nursing", "Director of Nursing"]},
    "midwife": {"name": "Midwife", "icon": "bi-person-heart",
                "does": "Run the labour ward, triage mothers and give maternity care.",
                "ladder": ["Staff Midwife", "Senior Staff Midwife", "Midwifery Officer", "Senior Midwifery Officer",
                           "Principal Midwifery Officer", "Deputy Director of Midwifery", "Director of Midwifery"]},
    "pharmacist": {"name": "Pharmacist", "icon": "bi-capsule-pill",
                   "does": "Dispense, and stop unsafe prescriptions before they reach the patient.",
                   "ladder": ["House Pharmacist", "Pharmacist", "Senior Pharmacist", "Principal Pharmacist",
                              "Chief Pharmacist", "Deputy Director of Pharmacy", "Director of Pharmacy"]},
    "lab_scientist": {"name": "Lab scientist", "icon": "bi-droplet-half",
                      "does": "Run blood tests, cultures and crossmatch.",
                      "ladder": ["Intern Lab Scientist", "Medical Laboratory Scientist", "Senior Lab Scientist",
                                 "Principal Lab Scientist", "Chief Lab Scientist", "Head of Laboratory"]},
    "radiographer": {"name": "Radiographer", "icon": "bi-radioactive",
                     "does": "Run X-rays, CT scans and ultrasound.",
                     "ladder": ["Intern Radiographer", "Radiographer", "Senior Radiographer",
                                "Principal Radiographer", "Chief Radiographer", "Head of Imaging"]},
    "paramedic": {"name": "Paramedic / EMT", "icon": "bi-truck",
                  "does": "Bring patients in, hand over at the bay and transfer referrals out.",
                  "ladder": ["EMT", "Senior EMT", "Paramedic", "Senior Paramedic",
                             "Principal Paramedic", "Zonal Coordinator"]},
}

DEFAULT_DEPT = {"doctor": "emergency", "student": "opd", "nurse": "emergency", "midwife": "maternity",
                "pharmacist": "pharmacy", "lab_scientist": "lab", "radiographer": "radiology",
                "paramedic": "ambulance"}


def rank_for(role, xp):
    lvl = 0
    for i, threshold in enumerate(LEVELS):
        if xp >= threshold:
            lvl = i
    ladder = ROLES[role]["ladder"]
    title = ladder[min(lvl, len(ladder) - 1)]
    nxt = LEVELS[lvl + 1] if lvl + 1 < len(LEVELS) else None
    return lvl, title, LEVELS[lvl], nxt


# dept: "bedside" results are instant; "lab" and "radiology" go to a queue.
TESTS = {
    "malaria_rdt":    {"name": "Malaria RDT",                       "dept": "bedside"},
    "rbs":            {"name": "Blood glucose (glucometer)",        "dept": "bedside"},
    "urine_dipstick": {"name": "Urine dipstick",                    "dept": "bedside"},
    "ecg":            {"name": "12-lead ECG",                       "dept": "bedside"},
    "blood_film":     {"name": "Blood film for malaria parasites",  "dept": "lab"},
    "fbc":            {"name": "Full blood count",                  "dept": "lab"},
    "rft":            {"name": "Urea, creatinine and electrolytes", "dept": "lab"},
    "lft":            {"name": "Liver function tests",              "dept": "lab"},
    "gxm":            {"name": "Group and crossmatch",              "dept": "lab"},
    "clotting":       {"name": "Clotting profile",                  "dept": "lab"},
    "blood_culture":  {"name": "Blood culture",                     "dept": "lab"},
    "wound_swab":     {"name": "Wound swab culture",                "dept": "lab"},
    "widal":          {"name": "Widal test",                        "dept": "lab"},
    "cxr":            {"name": "Chest X-ray",                       "dept": "radiology"},
    "ct_head":        {"name": "CT head",                           "dept": "radiology"},
    "cspine":         {"name": "Cervical spine imaging",            "dept": "radiology"},
    "xray_foot":      {"name": "Foot X-ray",                        "dept": "radiology"},
    "abd_xray":       {"name": "Erect chest and abdominal X-ray",   "dept": "radiology"},
    "obs_scan":       {"name": "Obstetric ultrasound",              "dept": "radiology"},
}

NAMES_M = ["Kwame", "Kofi", "Kwabena", "Kwaku", "Yaw", "Kojo", "Kwesi", "Fiifi", "Selorm", "Elikem",
           "Nii", "Ebo", "Mawuli", "Issah", "Yakubu", "Abdul-Rahman", "Senyo", "Kobina", "Atta", "Edem"]
NAMES_F = ["Ama", "Akosua", "Adwoa", "Abena", "Akua", "Yaa", "Afia", "Esi", "Efua", "Aba", "Dzifa",
           "Enyonam", "Naa", "Adjoa", "Fati", "Mariama", "Ayishetu", "Akweley", "Mansa", "Sedinam"]
SURNAMES = ["Mensah", "Asante", "Owusu", "Boateng", "Osei", "Agyeman", "Appiah", "Quaye", "Tetteh",
            "Lamptey", "Addo", "Darko", "Amoah", "Ofori", "Adjei", "Agbeko", "Dzokoto", "Abdulai",
            "Iddrisu", "Fuseini", "Sarpong", "Acheampong", "Kuffour", "Ansah", "Nartey", "Sowah"]
FACILITIES = ["Ada East CHPS compound", "Dodowa District Hospital", "Kasoa Polyclinic",
              "Amasaman Municipal Hospital", "Weija Health Centre", "Abokobi Health Centre",
              "Nsawam Government Hospital", "Prampram Polyclinic"]
SCENES = ["999 call from Kaneshie Market", "999 call from a home in Teshie", "999 call from Circle",
          "999 call on the Accra–Tema Motorway", "999 call from a church in Kasoa"]


def M(text, good, drug=False):
    return {"t": text, "good": good, "drug": drug}


CASES = [
    {
        "id": "severe_malaria_child", "title": "Severe malaria with hypoglycaemia and severe anaemia",
        "dept": "paeds", "age": (2, 5), "sex": "any", "triage": "red", "arrival": ["walk_in", "referral"],
        "complaint": "Fever for 3 days, now very weak and had a fit at home",
        "vitals": {"Temp": "39.4 °C", "Pulse": "156 /min", "Resp. rate": "44 /min", "SpO2": "94%", "Weight": "13 kg"},
        "history": "Mother reports high fever for 3 days, treated at home with a herbal preparation and paracetamol. "
                   "One generalised fit lasting about 3 minutes this morning. Vomiting everything and unable to drink. "
                   "No cough, no diarrhoea. Sleeps under a net only sometimes. Immunisations up to date in the child health record book.",
        "exam": "Prostrate, cannot sit unsupported. Marked conjunctival and palmar pallor, mildly jaundiced. "
                "No neck stiffness. Capillary refill 3 seconds. Chest clear. Liver 3 cm and spleen 4 cm below the costal margin.",
        "key_tests": ["malaria_rdt", "rbs", "fbc"], "useful_tests": ["blood_film", "gxm", "rft", "blood_culture"],
        "results": {"malaria_rdt": "Positive (P. falciparum)", "blood_film": "P. falciparum, high parasitaemia (8%)",
                    "rbs": "2.4 mmol/L (low)", "fbc": "Hb 4.6 g/dL, WBC 11.2, platelets 68",
                    "gxm": "O Rh D positive, 1 unit crossmatched", "rft": "Urea mildly raised, creatinine normal"},
        "dx_options": ["Severe malaria with hypoglycaemia and severe anaemia", "Bacterial meningitis",
                       "Uncomplicated malaria", "Febrile convulsion with a viral illness"], "dx": 0,
        "mgmt": [M("Parenteral artesunate (IV or IM)", True, True),
                 M("Correct low glucose with IV dextrose and recheck", True, True),
                 M("Transfuse blood after group and crossmatch", True),
                 M("Paracetamol for fever", True, True),
                 M("Oral artemether-lumefantrine and review at OPD in 3 days", False, True),
                 M("Continue the herbal preparation alongside treatment", False),
                 M("Monitor glucose, conscious level and urine output closely", True)],
        "dispo": "admit_paeds", "dx_keywords": ["severe malaria", "malaria"],
        "learning": "Prostration, convulsions, low glucose and Hb below 5 g/dL are features of severe malaria. "
                    "Give parenteral artesunate first, check glucose early in every sick child, then complete a full oral ACT course once the child can take orally.",
        "round_q": {"q": "After 24 hours of artesunate the child is alert and feeding. What next?",
                    "options": ["Stop all antimalarials", "Complete a full 3-day oral ACT course",
                                "Switch to IV quinine for 7 days", "Give a single dose of SP"],
                    "answer": 1, "why": "Once the child can take orally (after at least 24 hours of parenteral artesunate), finish treatment with a full oral ACT course."},
    },
    {
        "id": "sickle_voc", "title": "Sickle cell vaso-occlusive (painful) crisis",
        "dept": "emergency", "age": (14, 28), "sex": "any", "triage": "orange", "arrival": ["walk_in", "ambulance"],
        "complaint": "Severe pain in both legs and lower back since last night",
        "vitals": {"Temp": "37.9 °C", "Pulse": "112 /min", "BP": "116/70", "Resp. rate": "22 /min", "SpO2": "97%", "Pain": "9 out of 10"},
        "history": "Known sickle cell disease (HbSS), attends the sickle cell clinic. Pain began after a long day travelling in the heat with little water. "
                   "Home painkillers have not helped. No chest pain, cough or breathlessness. Last crisis 4 months ago. Hydroxyurea often runs out.",
        "exam": "In obvious distress. Mild scleral icterus. Tender over both femurs and the lumbar spine, no joint swelling. "
                "Chest clear with good air entry. Spleen not palpable. No neurological deficit.",
        "key_tests": ["fbc", "malaria_rdt"], "useful_tests": ["blood_film", "rft", "lft"],
        "results": {"fbc": "Hb 7.1 g/dL (usual about 7.5), WBC 13.4, platelets 410", "malaria_rdt": "Negative",
                    "lft": "Raised unconjugated bilirubin, otherwise normal"},
        "dx_options": ["Vaso-occlusive (painful) crisis", "Acute chest syndrome", "Septic arthritis",
                       "Splenic sequestration crisis"], "dx": 0,
        "mgmt": [M("Prompt, adequate analgesia including an opioid, with regular pain scores", True, True),
                 M("Oral or IV fluids to keep well hydrated", True, True),
                 M("Keep the patient warm", True),
                 M("Incentive spirometry and watch for chest symptoms", True),
                 M("Hold pain relief until the blood results are back", False),
                 M("Routine blood transfusion for the crisis", False),
                 M("Pethidine as the first-choice painkiller", False, True)],
        "dispo": "admit_medical", "dx_keywords": ["vaso-occlusive", "painful crisis", "sickle"],
        "learning": "Pain in sickle cell disease is an emergency: give effective analgesia quickly (aim within 30 minutes), hydrate, keep warm, and watch for acute chest syndrome. "
                    "Pethidine is avoided and transfusion is not routine for an uncomplicated painful crisis.",
        "round_q": {"q": "Day 2 on the ward: new fever, chest pain and SpO2 of 91%. What do you suspect?",
                    "options": ["Worsening bone pain", "Acute chest syndrome", "Drug reaction", "Malaria relapse"],
                    "answer": 1, "why": "New chest symptoms, fever or low oxygen during a crisis suggest acute chest syndrome. Get a chest X-ray, give oxygen and antibiotics, and escalate early."},
    },
    {
        "id": "severe_pet", "title": "Severe pre-eclampsia",
        "dept": "maternity", "age": (20, 38), "sex": "F", "triage": "red", "arrival": ["walk_in", "referral"],
        "complaint": "32 weeks pregnant with a bad headache, blurred vision and swollen feet",
        "vitals": {"BP": "172/114", "Pulse": "98 /min", "Resp. rate": "20 /min", "Temp": "36.8 °C", "SpO2": "98%", "Fetal heart": "142 /min"},
        "history": "G2P1 at 32 weeks by early scan. Four antenatal visits; BP was normal at 24 weeks. Frontal headache for 2 days, now with flashing lights. "
                   "Upper abdominal pain this morning. Fetal movements present. No bleeding, no fluid leak.",
        "exam": "Facial and pedal oedema. Brisk reflexes, no clonus. Epigastric tenderness. Fundal height 31 cm, cephalic, fetal heart regular. No contractions.",
        "key_tests": ["urine_dipstick", "fbc", "lft", "rft"], "useful_tests": ["obs_scan", "clotting", "gxm"],
        "results": {"urine_dipstick": "Protein 3+", "fbc": "Hb 11.0 g/dL, platelets 92", "lft": "ALT 156, AST 180 (raised)",
                    "rft": "Creatinine 98 µmol/L, uric acid raised",
                    "obs_scan": "Single live fetus, estimated weight 1.7 kg, reduced liquor"},
        "dx_options": ["Severe pre-eclampsia", "Migraine in pregnancy", "Mild gestational hypertension",
                       "Malaria in pregnancy"], "dx": 0,
        "mgmt": [M("Magnesium sulfate to prevent eclamptic fits", True, True),
                 M("Antihypertensive (nifedipine, labetalol or hydralazine)", True, True),
                 M("Antenatal corticosteroids for fetal lungs", True, True),
                 M("Plan delivery once the mother is stable", True),
                 M("Strict fluid balance with BP, reflex and urine output monitoring", True),
                 M("Furosemide to reduce the swelling", False, True),
                 M("Send home with a BP check at next week's ANC", False)],
        "dispo": "admit_maternity", "dx_keywords": ["pre-eclampsia", "preeclampsia"],
        "learning": "Severe hypertension with headache, visual symptoms, epigastric pain, low platelets or raised liver enzymes means severe pre-eclampsia. "
                    "Magnesium sulfate prevents eclampsia, BP must be controlled, and delivery is the definitive treatment. Diuretics are not used for the oedema.",
        "round_q": {"q": "On magnesium sulfate, the midwife finds absent knee reflexes and a resp. rate of 10. What now?",
                    "options": ["Continue the infusion", "Stop magnesium and give calcium gluconate",
                                "Increase the magnesium", "Give diazepam"],
                    "answer": 1, "why": "Absent reflexes and slow breathing are signs of magnesium toxicity. Stop the infusion and give calcium gluconate, the antidote."},
    },
    {
        "id": "pph", "title": "Postpartum haemorrhage from uterine atony",
        "dept": "maternity", "age": (22, 40), "sex": "F", "triage": "red", "arrival": ["referral"],
        "complaint": "Heavy bleeding after delivering at a CHPS compound an hour ago",
        "vitals": {"BP": "84/50", "Pulse": "132 /min", "Resp. rate": "26 /min", "Temp": "36.2 °C", "SpO2": "95%"},
        "history": "Para 5. Delivered a 3.9 kg baby vaginally at the CHPS compound. Oxytocin given at delivery, placenta reported complete. "
                   "Bleeding continued and soaked several pads on the way. Antenatal Hb was 9.8 g/dL.",
        "exam": "Pale, cold peripheries, anxious. Uterus soft, boggy and above the umbilicus. Heavy ongoing bleeding with clots. No obvious perineal tear.",
        "key_tests": ["fbc", "gxm"], "useful_tests": ["clotting", "rft"],
        "results": {"fbc": "Hb 6.4 g/dL, platelets 180", "gxm": "B Rh D positive, 2 units crossmatched",
                    "clotting": "Mildly prolonged PT"},
        "dx_options": ["Postpartum haemorrhage from uterine atony", "Retained placenta", "Uterine rupture",
                       "Normal lochia"], "dx": 0,
        "mgmt": [M("Call for help and massage the uterus", True),
                 M("Oxytocin infusion", True, True),
                 M("Tranexamic acid", True, True),
                 M("Two large-bore IV lines and IV crystalloids", True, True),
                 M("Transfuse blood", True),
                 M("Catheterise and examine the placenta and genital tract", True),
                 M("Observe for an hour to see whether the bleeding settles", False)],
        "dispo": "admit_maternity", "dx_keywords": ["postpartum haemorrhage", "pph", "atony"],
        "learning": "Act fast in PPH. The WHO E-MOTIVE approach bundles uterine massage, oxytocic drugs, tranexamic acid, IV fluids and examination, "
                    "escalating if bleeding continues. Measure blood loss rather than guessing.",
        "round_q": {"q": "Despite massage, oxytocin and tranexamic acid the bleeding continues. A reasonable next step while theatre is prepared?",
                    "options": ["Discharge home", "Bimanual compression or balloon tamponade", "Stop all fluids",
                                "Antibiotics only"],
                    "answer": 1, "why": "If first-line measures fail, bimanual compression or an intrauterine balloon tamponade can control bleeding while surgery is prepared."},
    },
    {
        "id": "edh", "title": "Head injury with extradural haematoma", "needs_o2": True,
        "dept": "emergency", "age": (18, 35), "sex": "M", "triage": "red", "arrival": ["ambulance"],
        "scene": "Motorbike crash on the Madina–Adenta road", "post_op": "surgical",
        "complaint": "Thrown off a motorbike, knocked out briefly, now drowsy and vomiting",
        "vitals": {"BP": "146/82", "Pulse": "64 /min", "Resp. rate": "18 /min", "SpO2": "95%", "GCS": "12/15 (E3 V4 M5)"},
        "history": "Okada rider, no helmet. Witnesses say he was unconscious for about a minute, then talked, then became drowsier in the ambulance. Vomited twice. No known illnesses.",
        "exam": "Boggy swelling over the right temple. Right pupil 5 mm and sluggish, left 3 mm and reactive. Moves all limbs, weaker on the left. "
                "Cervical collar in place. Chest, abdomen and pelvis clinically normal.",
        "key_tests": ["ct_head", "cspine"], "useful_tests": ["fbc", "gxm", "rbs"],
        "results": {"ct_head": "Right temporal lens-shaped extradural haematoma with midline shift", "cspine": "No fracture",
                    "fbc": "Hb 13.2 g/dL", "rbs": "6.1 mmol/L"},
        "dx_options": ["Extradural haematoma after head injury", "Alcohol intoxication", "Concussion only",
                       "Subarachnoid haemorrhage from an aneurysm"], "dx": 0,
        "mgmt": [M("ABCDE assessment with cervical spine protection", True),
                 M("Oxygen and head of bed raised", True),
                 M("Frequent neuro observations (GCS and pupils)", True),
                 M("Urgent neurosurgical review for evacuation", True),
                 M("Analgesia and an anti-emetic", True, True),
                 M("Sedate him so he stops being restless", False, True),
                 M("Admit to the ward and repeat CT in 24 hours", False)],
        "dispo": "theatre", "dx_keywords": ["extradural", "epidural haematoma", "edh"],
        "learning": "A lucid interval followed by deterioration, a dilating pupil and a lens-shaped bleed on CT point to an extradural haematoma. "
                    "Early evacuation saves lives. Helmets prevent many of these injuries.",
        "round_q": {"q": "Which CT feature best separates an extradural from a subdural haematoma?",
                    "options": ["Crescent shape crossing suture lines", "Lens shape limited by suture lines",
                                "Blood in the ventricles", "Diffuse brain swelling"],
                    "answer": 1, "why": "Extradural bleeds are lens-shaped and stop at suture lines; subdural bleeds are crescent-shaped and can cross them."},
    },
    {
        "id": "ich", "title": "Haemorrhagic stroke with severe hypertension",
        "dept": "emergency", "age": (48, 72), "sex": "any", "triage": "red", "arrival": ["walk_in", "ambulance"],
        "complaint": "Sudden weakness of the right side and slurred speech 2 hours ago",
        "vitals": {"BP": "214/122", "Pulse": "88 /min", "Resp. rate": "18 /min", "SpO2": "96%", "GCS": "14/15"},
        "history": "Hypertensive for 10 years, stopped medication 6 months ago after feeling well. Sudden headache then right arm and leg weakness at the market. "
                   "No known diabetes. Takes herbal bitters.",
        "exam": "Right arm power 2/5, leg 3/5, right facial droop, expressive dysphasia. No neck stiffness. Regular pulse, normal heart sounds.",
        "key_tests": ["ct_head", "rbs"], "useful_tests": ["fbc", "rft", "ecg", "clotting", "lft"],
        "results": {"ct_head": "Acute left basal ganglia intracerebral haemorrhage, no midline shift", "rbs": "7.2 mmol/L",
                    "ecg": "Sinus rhythm with left ventricular hypertrophy", "rft": "Creatinine 132 µmol/L"},
        "dx_options": ["Intracerebral (haemorrhagic) stroke", "Ischaemic stroke", "Hypoglycaemia",
                       "Weakness after a seizure"], "dx": 0,
        "mgmt": [M("Lower BP carefully with an antihypertensive and monitor closely", True, True),
                 M("Nil by mouth until a swallow screen is passed", True),
                 M("Position to protect the airway, with neuro observations", True),
                 M("Start aspirin straight away", False, True),
                 M("Physiotherapy and early mobilisation once stable", True),
                 M("Bring BP down to normal within 10 minutes", False)],
        "dispo": "admit_medical", "dx_keywords": ["haemorrhagic stroke", "intracerebral", "hemorrhagic", "ich"],
        "learning": "Image before giving aspirin: CT separates a bleed from a clot, and antiplatelets in a haemorrhagic stroke can worsen bleeding. "
                    "Lower very high BP carefully, screen swallowing before feeding, and support long-term BP control.",
        "round_q": {"q": "Before discharge, what single step best prevents another stroke for this patient?",
                    "options": ["Lifelong aspirin", "Sustained BP control with adherence support", "Herbal bitters",
                                "Three months of bed rest"],
                    "answer": 1, "why": "Hypertension drives intracerebral haemorrhage. Durable BP control with affordable drugs and adherence support is the key step."},
    },
    {
        "id": "diabetic_foot", "title": "Infected diabetic foot ulcer with osteomyelitis",
        "dept": "opd", "age": (40, 68), "sex": "any", "triage": "yellow", "arrival": ["walk_in", "referral"],
        "complaint": "Smelly wound on the right foot for 3 weeks, now with fever",
        "vitals": {"Temp": "38.6 °C", "Pulse": "104 /min", "BP": "138/84", "Resp. rate": "20 /min", "SpO2": "97%"},
        "history": "Type 2 diabetes for 12 years on tablets, irregular clinic visits. Injured the sole walking barefoot; wound treated with a herbal paste. "
                   "Increasing swelling, pain and foul discharge. Reduced feeling in both feet.",
        "exam": "Deep ulcer on the right forefoot with slough and foul discharge, cellulitis up to the ankle. Probe-to-bone test positive. "
                "Weak dorsalis pedis pulse. Reduced monofilament sensation in both feet.",
        "key_tests": ["rbs", "fbc", "xray_foot", "wound_swab"], "useful_tests": ["rft", "blood_culture", "urine_dipstick"],
        "results": {"rbs": "21.8 mmol/L", "fbc": "WBC 18.6, Hb 10.9 g/dL",
                    "xray_foot": "Cortical erosion of the 2nd metatarsal head, consistent with osteomyelitis",
                    "wound_swab": "Staphylococcus aureus and Gram-negative bacilli, sensitivities pending",
                    "rft": "Creatinine 110 µmol/L", "urine_dipstick": "Glucose 3+, ketones trace"},
        "dx_options": ["Infected diabetic foot ulcer with osteomyelitis", "Simple cellulitis", "Gout", "Mycetoma"], "dx": 0,
        "mgmt": [M("IV broad-spectrum antibiotics, adjusted to culture", True, True),
                 M("Control blood glucose with insulin", True, True),
                 M("Surgical debridement of dead tissue", True),
                 M("Offload pressure from the foot", True),
                 M("Continue the herbal paste on the wound", False),
                 M("Discharge on oral antibiotics only", False, True)],
        "dispo": "admit_surgical", "dx_keywords": ["diabetic foot", "osteomyelitis"],
        "learning": "A diabetic foot ulcer that probes to bone is osteomyelitis until proven otherwise. Treat infection, debride, control glucose and offload. "
                    "Daily foot checks and proper footwear prevent many amputations.",
        "round_q": {"q": "Which bedside test strongly suggests osteomyelitis under a diabetic foot ulcer?",
                    "options": ["Capillary refill", "Probe-to-bone test", "Tuning fork test", "Ankle reflex"],
                    "answer": 1, "why": "Touching bone with a sterile probe through the ulcer strongly suggests osteomyelitis and needs imaging and prolonged treatment."},
    },
    {
        "id": "child_pneumonia", "title": "Severe pneumonia", "needs_o2": True,
        "dept": "paeds", "age": (1, 4), "sex": "any", "triage": "orange", "arrival": ["walk_in", "referral"],
        "complaint": "Cough and fast breathing for 3 days, not feeding well",
        "vitals": {"Temp": "38.7 °C", "Pulse": "148 /min", "Resp. rate": "58 /min", "SpO2": "88%", "Weight": "11 kg"},
        "history": "Cough and fever for 3 days, faster breathing since yesterday, refusing feeds today. No fits. Lives in a compound house; mother cooks with charcoal indoors. "
                   "Vaccines up to date including PCV.",
        "exam": "Lower chest wall indrawing and nasal flaring. Crackles and bronchial breathing over the right lower zone. Alert, not pale, no wheeze.",
        "key_tests": ["cxr", "malaria_rdt"], "useful_tests": ["fbc", "blood_culture"],
        "results": {"cxr": "Right lower lobe consolidation", "malaria_rdt": "Negative", "fbc": "WBC 19.2 with neutrophilia"},
        "dx_options": ["Severe pneumonia", "Bronchiolitis", "Severe malaria", "Asthma attack"], "dx": 0,
        "mgmt": [M("Oxygen to keep SpO2 at 90% or above", True),
                 M("IV antibiotics (ampicillin with gentamicin)", True, True),
                 M("Paracetamol, and keep feeding and fluids going", True, True),
                 M("Monitor resp. rate, SpO2 and feeding closely", True),
                 M("Cough syrup and send home", False, True),
                 M("Routine steroids", False, True)],
        "dispo": "admit_paeds", "dx_keywords": ["pneumonia"],
        "learning": "Chest indrawing or SpO2 below 90% means severe pneumonia in a child. Oxygen saves lives; give parenteral antibiotics, keep feeding, and check for malaria. "
                    "Indoor cooking smoke is a common, preventable risk.",
        "round_q": {"q": "Day 3: still febrile, reduced breath sounds and dullness on the right. What complication do you look for?",
                    "options": ["Pleural effusion or empyema", "Asthma", "Otitis media", "Measles"],
                    "answer": 0, "why": "Persistent fever with dullness and reduced breath sounds suggests an effusion or empyema. Confirm with ultrasound or X-ray and drain if needed."},
    },
    {
        "id": "typhoid_perf", "title": "Typhoid ileal perforation",
        "dept": "emergency", "age": (10, 25), "sex": "any", "triage": "red", "arrival": ["walk_in", "referral"],
        "post_op": "surgical",
        "complaint": "Fever for 2 weeks, now sudden severe belly pain",
        "vitals": {"Temp": "38.9 °C", "Pulse": "124 /min", "BP": "96/60", "Resp. rate": "26 /min", "SpO2": "96%"},
        "history": "Two weeks of fever, headache and abdominal discomfort treated at a chemist shop with several antibiotics. "
                   "Sudden severe abdominal pain since last night, vomiting. Drinks from a shared well.",
        "exam": "Ill and dehydrated. Abdomen distended and rigid with guarding and rebound tenderness, bowel sounds absent.",
        "key_tests": ["abd_xray", "fbc", "rft", "gxm"], "useful_tests": ["blood_culture"],
        "results": {"abd_xray": "Free gas under the diaphragm", "fbc": "WBC 3.8 (low), Hb 10.2 g/dL",
                    "rft": "Urea raised, potassium 3.1 (low)", "gxm": "A Rh D positive, 2 units crossmatched",
                    "blood_culture": "Salmonella Typhi isolated",
                    "widal": "Raised titres. The Widal test is unreliable and should not guide diagnosis."},
        "dx_options": ["Typhoid ileal perforation with peritonitis", "Acute appendicitis", "Gastroenteritis",
                       "Peptic ulcer disease"], "dx": 0,
        "mgmt": [M("IV fluid resuscitation and correct electrolytes", True, True),
                 M("Nil by mouth with a nasogastric tube", True),
                 M("IV antibiotics covering typhoid and gut organisms", True, True),
                 M("Urgent laparotomy", True),
                 M("Give a laxative for the distension", False, True),
                 M("Treat as an outpatient with oral antibiotics", False, True)],
        "dispo": "theatre", "dx_keywords": ["typhoid", "perforation"],
        "learning": "Sudden worse abdominal pain after prolonged fever suggests typhoid perforation. Resuscitate, start antibiotics and operate early. "
                    "Blood culture confirms typhoid; the Widal test misleads. Safe water and sanitation prevent it.",
        "round_q": {"q": "Which test confirms typhoid fever?",
                    "options": ["Widal test", "Blood culture", "Malaria RDT", "Urine dipstick"],
                    "answer": 1, "why": "Blood culture confirms typhoid. The Widal test has poor accuracy and causes overdiagnosis."},
    },
    {
        "id": "uncomplicated_malaria", "title": "Uncomplicated malaria",
        "dept": "opd", "age": (18, 55), "sex": "any", "triage": "green", "arrival": ["walk_in", "referral"],
        "complaint": "Fever, headache and body pains for 2 days",
        "vitals": {"Temp": "38.4 °C", "Pulse": "96 /min", "BP": "122/78", "Resp. rate": "18 /min", "SpO2": "98%"},
        "history": "Trader at Makola. Fever with chills, headache, joint pains and poor appetite for 2 days. Still eating and drinking. "
                   "No vomiting, no confusion, no dark urine. No other illnesses.",
        "exam": "Alert and walking. Warm to touch. Not pale or jaundiced. Chest clear. Abdomen soft, no organomegaly.",
        "key_tests": ["malaria_rdt"], "useful_tests": ["blood_film", "fbc"],
        "results": {"malaria_rdt": "Positive (P. falciparum)", "blood_film": "P. falciparum, low parasitaemia",
                    "fbc": "Hb 13.0 g/dL, platelets 140"},
        "dx_options": ["Uncomplicated malaria", "Severe malaria", "Typhoid fever", "Viral hepatitis"], "dx": 0,
        "mgmt": [M("Oral artemether-lumefantrine, full 3-day course with food", True, True),
                 M("Paracetamol for fever and pain", True, True),
                 M("Explain the danger signs that need a quick return", True),
                 M("Sleep under a treated net", True),
                 M("Admit for IV artesunate", False),
                 M("Add an antibiotic just in case", False, True)],
        "dispo": "discharge", "dx_keywords": ["uncomplicated malaria", "malaria"],
        "learning": "Test before you treat. A positive RDT with no danger signs is uncomplicated malaria: give a full oral ACT course, counsel on danger signs and net use. "
                    "Unneeded antibiotics drive resistance.",
        "round_q": {"q": "Which sign would turn uncomplicated malaria into severe malaria?",
                    "options": ["Headache", "Repeated vomiting or inability to drink", "Mild fever", "Body pains"],
                    "answer": 1, "why": "Inability to take oral medicines, prostration, convulsions, confusion or bleeding are danger signs that need parenteral treatment."},
    },
]

CASES.append({
    "id": "burns_child", "title": "Major scald burns in a child (about 25% of body surface)",
    "dept": "paeds", "age": (2, 6), "sex": "any", "triage": "red", "arrival": ["referral"],
    "refer_specialty": "burns",
    "complaint": "Pulled a pot of hot soup onto himself 2 hours ago",
    "vitals": {"Temp": "36.9 °C", "Pulse": "148 /min", "Resp. rate": "32 /min", "SpO2": "97%", "Weight": "15 kg", "Burns": "About 25% TBSA"},
    "history": "Pulled a pot of boiling light soup off a coal pot. Raw egg and toothpaste were put on the burns at home before the health centre gave a painkiller and referred. "
               "Crying, has not passed urine since.",
    "exam": "Distressed. Scalds over the chest, abdomen and both arms, mostly partial thickness with blisters, some white painless areas. "
            "No face or airway burns. Capillary refill 3 seconds.",
    "key_tests": ["fbc", "rft"], "useful_tests": ["gxm", "rbs"],
    "results": {"fbc": "Hb 14.8 g/dL (haemoconcentrated)", "rft": "Urea mildly raised, sodium 134"},
    "dx_options": ["Major scald burns needing burns-centre care", "Minor burns for outpatient dressing",
                   "Chemical burns", "Cellulitis"], "dx": 0,
    "mgmt": [M("IV fluids by a burns formula plus maintenance, guided by urine output", True, True),
             M("Adequate analgesia", True, True),
             M("Wash off the egg and toothpaste and cover with cling film or clean dressings", True),
             M("Keep the child warm", True),
             M("Urinary catheter to monitor output", True),
             M("Put ice on the burns", False),
             M("Routine prophylactic antibiotics", False, True)],
    "dispo": "refer_out", "dx_keywords": ["burn", "scald"],
    "learning": "Children with more than about 10% burns need IV fluids and specialist burns care. Cool early with running water, cover with clean film, keep warm, "
                "give analgesia and fluids and watch urine output. Ice, toothpaste and raw egg damage the wound. Call the burns centre and confirm a bed before transfer.",
    "round_q": {"q": "Which first aid is best for a fresh scald?",
                "options": ["Ice", "Cool running water for about 20 minutes", "Toothpaste", "Palm oil"],
                "answer": 1, "why": "Cool running water for about 20 minutes, started early, limits the depth of the burn. Ice and home remedies make it worse."},
})

CASE_BY_ID = {c["id"]: c for c in CASES}
