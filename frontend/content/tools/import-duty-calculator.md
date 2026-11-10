---
title: Kenya import duty calculator
short_title: Import duty calculator
description: Work out import duty, excise, VAT, the IDF and Railway Development Levy on goods shipped to Kenya, from the price, shipping and the tariff band.
date_created: 2026-11-10
tool: import-duty-calculator
---

The duty rate is not the cost. Between the price you paid and the goods in
your hands in Nairobi sit import duty, sometimes excise, VAT charged on a value
that already includes the duty, and two levies. On most finished goods the
taxes come to about half the customs value.

{% tool "import-duty-calculator" %}

## How the taxes stack

Everything starts from the **customs value**: the price of the goods, plus the
shipping to Kenya, plus the insurance - what shippers call CIF. Duty is
charged on all three, not on the invoice alone.

1. **Import duty** on the customs value, at the rate for the goods' tariff band.
2. **Excise duty**, on some goods only, on the customs value plus the import duty.
3. **VAT** at {{ VAT_RATE|percent }}% on the customs value plus the import
   duty and any excise. Medicines, many foods and some farm inputs are exempt
   or zero-rated.
4. **Import Declaration Fee (IDF)** at {{ CAR_IDF_RATE|percent }}% of the customs value.
5. **Railway Development Levy (RDL)** at {{ CAR_RDL_RATE|percent }}% of the customs value.

The IDF and the levy are charged on the customs value alone, and VAT is not
charged on them.

## The tariff bands

Kenya applies the East African Community's Common External Tariff, so the
duty on most goods is the same in Uganda, Tanzania and Rwanda:

- **{{ IMPORT_DUTY_BAND_ZERO|percent }}%** - raw materials, machinery and other
  capital goods, medicines and farm inputs.
- **{{ IMPORT_DUTY_BAND_INTERMEDIATE|percent }}%** - part-made goods and inputs
  for manufacturing.
- **{{ IMPORT_DUTY_BAND_FINISHED|percent }}%** - finished goods, which is most
  of what people order for themselves or for a shop.
- **{{ IMPORT_DUTY_BAND_TOP|percent }}%** - goods the region protects, such as
  clothes and textiles, furniture, iron and steel, and some foods.

A few **sensitive items** - sugar, rice, wheat and milk among them - are charged much
more. And each year the EAC lets a country set its own rate on particular
goods for twelve months. From July 2026, for example, Kenya charges
**{{ PHONE_IMPORT_DUTY_RATE|percent }}% on mobile phones**, which the common
tariff puts at zero.

Which band your goods fall in is decided by their **HS code** - the customs
classification - not by how you describe them. A clearing agent can tell you
the code and its rate before you order.

## Parcels and online orders

Couriers and the postal service clear small parcels for you, pay the duty and
VAT, and collect it before delivery with a handling fee of their own. The
calculator gives the taxes; the courier's fee is on top.

## What this does not include

- **Port or airport storage**, which starts after a few free days
- **Your clearing agent's or courier's fee**
- **KEBS inspection**, for goods that need a certificate of conformity and
  arrive without one
- **Delivery** from Mombasa or JKIA to you

!!! warning "Customs values the goods, not your invoice"
    KRA checks declared values against its own database. Where the invoice looks
    low for the item, its figure is used instead, and an under-declared
    shipment risks penalties as well as the extra duty.

**[Importing goods into Kenya ➞](/guides/importing-goods-into-kenya)**
**[Car import duty calculator ➞](/tools/car-import-duty-calculator)**
**[Online shopping in Kenya ➞](/guides/online-shopping-in-kenya)**
