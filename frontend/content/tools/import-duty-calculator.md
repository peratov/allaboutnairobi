---
title: Ghana import duty calculator
short_title: Import duty calculator
description: Work out the duty, levies and VAT on goods imported into Ghana, from the value of the shipment and its tariff band.
date_created: 2026-09-08
---

The duty rate is not the cost. Between the invoice and the goods in your hands
sit import duty, five levies, and [[VAT]] charged on a base that already
includes most of them.

{% tool "import-duty-calculator" %}

## What the calculator is doing

Everything starts from the **[[CIF]]** value: the price of the goods, plus the
freight, plus the insurance. Duty is charged on that, not on the invoice alone.

| Charge | Charged on | Rate |
| --- | --- | --- |
| Import duty | CIF | The tariff band, {{ CET_BAND_SOCIAL|percent }}% to {{ CET_BAND_SPECIFIC|percent }}% |
| ECOWAS Levy | CIF | {{ ECOWAS_LEVY_RATE|percent }}% |
| African Union Import Levy | CIF | {{ AU_IMPORT_LEVY_RATE|percent }}% |
| EXIM Levy | CIF | {{ EXIM_LEVY_RATE|percent }}% |
| Special Import Levy, selected goods | CIF | {{ SPECIAL_IMPORT_LEVY_RATE|percent }}% |
| [[NHIL]] and GETFund | CIF + duty + levies | {{ VAT_LEVIES_TOTAL|percent }}% together |
| [[VAT]] | the same base | {{ VAT_RATE|percent }}% |
| Inspection fee | CIF | {{ IMPORT_INSPECTION_FEE_RATE|percent }}% |
| Network charge | CIF | {{ IMPORT_NETWORK_CHARGE_RATE|percent }}% |

The compounding is the point. VAT and its two levies are charged on a figure
that already contains the duty and the import levies, which is why the total
lands so far above the headline rate. Since 2026 VAT, NHIL and GETFund share
that one base, and the COVID levy that used to sit in this table is gone.

## The five tariff bands

Ghana applies the ECOWAS Common External Tariff:

| Band | Rate | Typically |
| --- | --- | --- |
| Social goods | {{ CET_BAND_SOCIAL|percent }}% | Medicines, most books, some basic foods |
| Raw materials | {{ CET_BAND_RAW_MATERIALS|percent }}% | Inputs and basic capital goods |
| Intermediate goods | {{ CET_BAND_INTERMEDIATE|percent }}% | Part-processed goods |
| Finished goods | {{ CET_BAND_FINISHED|percent }}% | Most personal imports |
| Specific goods | {{ CET_BAND_SPECIFIC|percent }}% | Goods where domestic production is protected |

Your band is set by the **[[HS code]]**, which is a classification, not a
description. A clearing agent earns their fee here.

## What this does not include

- **Port charges, [[demurrage]] and port rent**, which start after roughly
  {{ PORT_FREE_STORAGE_DAYS }} days
- **Your clearing agent's own fee**
- **Permits** from the [[FDA]], the [[GSA]] or another regulator
- **Transport** from the port

!!! warning "Customs values the goods, you do not"
    Duty is charged on customs' own valuation where that is higher than your
    invoice. A generous invoice from a friendly seller does not reduce the
    duty; it lengthens the query.

**[Importing and customs ➞](/guides/importing-and-customs)**
**[Importing a car ➞](/guides/importing-a-car)**
**[Exporting from Ghana ➞](/guides/exporting-from-ghana)**
