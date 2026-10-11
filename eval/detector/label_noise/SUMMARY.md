# Label-noise check of the WebUI training labels (200 boxes)

**This is an AI-assisted review, not the human hand check that `label_noise.py` was written for.** Six independent Sonnet reviewer agents each judged 100 of the 200 sampled validation boxes, two per lens, blind to each other. A person has not looked at the crops. The thesis must say so, and a human spot check (below) is recommended before the number is quoted as a finding.

Sample: 200 boxes drawn at random (seed 20261004) from the 1,500 held-out validation images, so the class mix follows box frequency: text 97, link 85, image_icon 13, button 2, input 2, choice 1. **The sample says almost nothing about button, input and choice**, the rare classes. Crops are in gitignored `data/label_noise/`; verdicts are in `label_noise_checked.csv`.

| lens | question | boxes judged correct (of 200) | noise rate (95% CI, binomial) |
|---|---|---|---|
| geometry | one complete element, tight box | 163 | 18.5% (±5.4) |
| class | class label right for what is in the box | 151 | 24.5% (±6.0) |
| **geometry and class (the `summarise` definition: box and class correct)** | | **133** | **33.5% (±6.5)** |
| strict auditor | usable as ground truth for a contrast or size check | 99 | 50.5% (±6.9) |

Headline: **33.5% of sampled labels fail the box-and-class test; the strict view puts it near 50%.** Per class (box and class correct / strict): text 56/97 and 35/97, link 62/85 and 54/85, image_icon 12/13 and 8/13; the other classes have 1 to 2 boxes each.

Agreement between lenses is only moderate: geometry against class kappa 0.29; geometry-and-class against strict kappa 0.40 (70% raw agreement). Reviewers marked 90 of 200 boxes as unsure on geometry or class, and 86 boxes were confident on all three lenses. The strict lens is deliberately harsh on small or ambiguous boxes, so read 33.5% as the central estimate and 50.5% as the upper bound.

What the noise looks like (reviewer notes): the most common geometry failure is a box on empty background (13 boxes), then tiny boxes, boxes that cut off part of an element, and boxes that span several. In the class lens the commonest failure is also "empty background" (11), then a logo or icon labelled as text or link and punctuation fragments labelled as text.

**My own check of the reviewers (one person, 16 crops):** of 8 boxes the geometry reviewers called "empty background", 7 look like genuine label errors (boxes on blank or gradient regions, partial words). One (id 63) is a faint rectangle that looks like a real empty text field, so the geometry lens is too harsh on empty inputs. Of 8 random crops, 7 looked correct to me. This is a small check and does not replace a full human pass.

Limitations: AI reviewers on small 24 px-padded crops (some reviewers used 10-crop contact sheets upscaled 2x, not one image at a time); no human rater; single sample of 200 with a wide interval; rare classes unmeasured; reviewer agreement only moderate.

Consequences for Chapter 5: the detector was trained and validated on labels with roughly one third noise, so its validation mAP (0.25 at 50:95) is a lower bound on how well it finds real elements, and part of the plateau after epoch 13 is likely label noise. Recommended before quoting: a human checks all boxes where the lenses disagree (about 60 of 200) plus a random 30.
