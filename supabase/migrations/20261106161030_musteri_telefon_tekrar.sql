-- musteri_telefon_tekrar
--
-- Panelden eklenen iki ayrı müşteri aynı telefon numarasını taşıyabilsin (aynı
-- aileden/işyerinden farklı kişiler, ortak numara). Bugün
-- customers_phone_unique_admin (yalnızca origin = 'admin_manual' müşterilerde
-- telefon benzersiz) ikinci kaydı veritabanı hatasıyla reddediyor.
--
-- Benzersizlik kuralı kalkıyor; yanlışlıkla çift kayıt açmayı uygulama katmanı
-- engelliyor: numara başka müşteride kayıtlıysa panel kimde olduğunu gösterir ve
-- "Yine de ekle" onayı ister (create-customer / update-customer).
--
-- Siteden kayıt olan müşteriler için olan customers_phone_unique_web DOKUNULMADI:
-- hesap/sipariş akışları o kümede numarayla tek müşteri bulmaya dayanıyor.
--
-- Geriye dönük uyumlu: yalnızca bir kısıt gevşer. Yayın penceresinde çalışan eski
-- kod, çift numarayı veritabanı hatası yerine sessizce kabul eder (kod yayınlanınca
-- uyarı devreye girer); başka hiçbir şey eski imzaya ya da kısıta dayanmıyor.
--
-- Dizin gerekçesi (CLAUDE.md §7): benzersiz dizin aynı zamanda "numaradan müşteri
-- bul" aramalarının dizini idi (sipariş sorgulama c.phone = ..., panel çift numara
-- kontrolü). Kaldırınca bu aramalar tablo taramasına dönerdi; bu yüzden benzersiz
-- olmayan, aynı kapsamda bir dizin onun yerine geçiyor. Önce yenisi açılır, sonra
-- eskisi kaldırılır, böylece arada dizinsiz an olmaz.

create index if not exists customers_phone_admin_idx
  on customers (phone)
  where phone is not null and origin = 'admin_manual';

drop index if exists customers_phone_unique_admin;
