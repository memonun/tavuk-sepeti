-- 20260823130100_finance_expense_categories_seed
--
-- Seeds the Apuhan Çiftliği expense category hierarchy. Data-only, additive.
-- system_key values are the only thing the next (backfill) migration
-- hardcodes — never a UUID — so this seed can be edited/re-run in a later
-- migration without touching application code.
--
-- "Faturalar" is deliberately NOT a category here (spec: a bill's economic
-- purpose, not "it arrived as an invoice", is what matters — an internet
-- bill is İletişim -> İnternet, not Faturalar).

do $$
declare
  v_parent uuid;
begin
  -- 1. Üretim Giderleri --------------------------------------------------
  insert into expense_categories (name, system_key, sort_order)
  values ('Üretim Giderleri', 'uretim_giderleri', 0)
  returning id into v_parent;

  insert into expense_categories (name, parent_id, system_key, sort_order) values
    ('Tavuk Yemi',          v_parent, 'uretim_tavuk_yemi',          0),
    ('Civciv / Yarka',      v_parent, 'uretim_civciv_yarka',        1),
    ('Veteriner',           v_parent, 'uretim_veteriner',           2),
    ('İlaç / Aşı',          v_parent, 'uretim_ilac_asi',            3),
    ('Kümes Malzemeleri',   v_parent, 'uretim_kumes_malzemeleri',   4),
    ('Genel Üretim',        v_parent, 'uretim_genel_uretim',        5);

  -- 2. Ambalaj & Paketleme -----------------------------------------------
  insert into expense_categories (name, system_key, sort_order)
  values ('Ambalaj & Paketleme', 'ambalaj_paketleme', 1)
  returning id into v_parent;

  insert into expense_categories (name, parent_id, system_key, sort_order) values
    ('Yumurta Viyolü', v_parent, 'ambalaj_yumurta_viyolu', 0),
    ('Koli',           v_parent, 'ambalaj_koli',           1),
    ('Ambalaj',        v_parent, 'ambalaj_ambalaj',        2),
    ('Etiket / Poşet', v_parent, 'ambalaj_etiket_poset',   3);

  -- 3. Lojistik & Araç -----------------------------------------------------
  insert into expense_categories (name, system_key, sort_order)
  values ('Lojistik & Araç', 'lojistik_arac', 2)
  returning id into v_parent;

  insert into expense_categories (name, parent_id, system_key, sort_order) values
    ('Yakıt',           v_parent, 'lojistik_yakit',           0),
    ('Kargo',           v_parent, 'lojistik_kargo',           1),
    ('Araç Bakım',      v_parent, 'lojistik_arac_bakim',      2),
    ('Araç Giderleri',  v_parent, 'lojistik_arac_giderleri',  3);

  -- 4. Enerji & Tesis -------------------------------------------------------
  insert into expense_categories (name, system_key, sort_order)
  values ('Enerji & Tesis', 'enerji_tesis', 3)
  returning id into v_parent;

  insert into expense_categories (name, parent_id, system_key, sort_order) values
    ('Elektrik',              v_parent, 'enerji_elektrik',           0),
    ('Su',                    v_parent, 'enerji_su',                 1),
    ('Doğalgaz / Isınma',     v_parent, 'enerji_dogalgaz_isinma',    2),
    ('Bakım ve Onarım',       v_parent, 'enerji_bakim_onarim',       3);

  -- 5. Personel & Hizmetler --------------------------------------------------
  insert into expense_categories (name, system_key, sort_order)
  values ('Personel & Hizmetler', 'personel_hizmetler', 4)
  returning id into v_parent;

  insert into expense_categories (name, parent_id, system_key, sort_order) values
    ('Maaş / Yevmiye',       v_parent, 'personel_maas_yevmiye',   0),
    ('Dış Hizmet',           v_parent, 'personel_dis_hizmet',     1),
    ('Personel Giderleri',   v_parent, 'personel_giderleri',      2);

  -- 6. Dijital Hizmetler ------------------------------------------------------
  insert into expense_categories (name, system_key, sort_order)
  values ('Dijital Hizmetler', 'dijital_hizmetler', 5)
  returning id into v_parent;

  insert into expense_categories (name, parent_id, system_key, sort_order) values
    ('Hosting',                       v_parent, 'dijital_hosting',                  0),
    ('Domain',                        v_parent, 'dijital_domain',                   1),
    ('Yazılım / SaaS',                v_parent, 'dijital_yazilim_saas',              2),
    ('E-Ticaret Hizmetleri',          v_parent, 'dijital_eticaret_hizmetleri',       3),
    ('Diğer Dijital Abonelikler',    v_parent, 'dijital_diger_abonelikler',         4);

  -- 7. İletişim ----------------------------------------------------------------
  insert into expense_categories (name, system_key, sort_order)
  values ('İletişim', 'iletisim', 6)
  returning id into v_parent;

  insert into expense_categories (name, parent_id, system_key, sort_order) values
    ('Telefon',                        v_parent, 'iletisim_telefon',            0),
    ('İnternet',                       v_parent, 'iletisim_internet',           1),
    ('SMS / Mesajlaşma Hizmetleri',   v_parent, 'iletisim_sms_mesajlasma',     2);

  -- 8. Pazarlama -----------------------------------------------------------------
  insert into expense_categories (name, system_key, sort_order)
  values ('Pazarlama', 'pazarlama', 7)
  returning id into v_parent;

  insert into expense_categories (name, parent_id, system_key, sort_order) values
    ('Google Ads',      v_parent, 'pazarlama_google_ads',     0),
    ('Meta Ads',        v_parent, 'pazarlama_meta_ads',       1),
    ('Basılı Reklam',   v_parent, 'pazarlama_basili_reklam',  2),
    ('Diğer Reklam',    v_parent, 'pazarlama_diger_reklam',   3);

  -- 9. Finansal & İdari Giderler ----------------------------------------------------
  insert into expense_categories (name, system_key, sort_order)
  values ('Finansal & İdari Giderler', 'finansal_idari', 8)
  returning id into v_parent;

  insert into expense_categories (name, parent_id, system_key, sort_order) values
    ('Banka Komisyonu',           v_parent, 'finansal_banka_komisyonu',        0),
    ('POS / PayTR Komisyonu',     v_parent, 'finansal_pos_paytr_komisyonu',    1),
    ('Muhasebe',                  v_parent, 'finansal_muhasebe',               2),
    ('Sigorta',                   v_parent, 'finansal_sigorta',                3),
    ('Vergi / Harç',              v_parent, 'finansal_vergi_harc',             4),
    ('Diğer İdari Giderler',     v_parent, 'finansal_diger_idari',            5);

  -- 10-12. Top-level categories with no children ---------------------------------
  insert into expense_categories (name, system_key, sort_order) values
    ('Pazar Giderleri',    'pazar_giderleri',  9),
    ('Yatırım / Demirbaş', 'yatirim_demirbas', 10),
    ('Diğer',              'diger',            11);
end $$;
