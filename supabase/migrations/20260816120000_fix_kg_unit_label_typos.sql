-- Data fix: dut-kurusu and gun-kurusu-kayisi-cekirdegi were entered via the
-- admin UI with unit_label "1" instead of "kg". Both are sold by the half
-- kilogram (min_qty/step = 0.5, same as cheese/yogurt) — the label should
-- read "kg" like the other weight-priced products, not the placeholder "1".
update products
set unit_label = 'kg'
where key in ('dut-kurusu', 'gun-kurusu-kayisi-cekirdegi')
  and unit_label = '1';
