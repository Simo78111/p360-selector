// The job finder: a tree of questions that ends in an outcome with free tips,
// "call us if" warnings and a starting price.
//
// DIY tips are deliberately limited to checks, isolating water/power and simple
// cleaning. Anything that counts as sanitary plumbing, gasfitting or
// drainlaying under the Plumbers, Gasfitters, and Drainlayers Act 2006 is left
// to a licensed tradesperson.

import { pricing } from "./site";
import type { ServiceSlug } from "./services";

export type Urgency = "diy" | "standard" | "urgent" | "emergency";

export type Option = {
  id: string;
  label: string;
  hint?: string;
  /** Next question to ask. */
  next?: string;
  /** Outcome this answer points to. Later answers can still refine urgency. */
  outcome?: string;
  /** Raises the urgency of the final outcome. */
  urgency?: Urgency;
};

export type Question = {
  id: string;
  title: string;
  subtitle?: string;
  /** Short label for the selections summary, e.g. "Problem". */
  summaryLabel: string;
  options: Option[];
};

export type Outcome = {
  id: string;
  service: ServiceSlug;
  title: string;
  summary: string;
  urgency: Urgency;
  price: { label: string; amount: number };
  tips: string[];
  callIf: string[];
};

const callOut = { label: "Call-out from", amount: pricing.from.callOut };
const gasCallOut = { label: "Gas call-out from", amount: pricing.from.gasCallOut };

export const ROOT = "service";

export const questions: Record<string, Question> = {
  service: {
    id: "service",
    title: "What do you need help with?",
    subtitle: "Pick the closest match. You can change it later.",
    summaryLabel: "Service",
    options: [
      { id: "plumbing", label: "Plumbing", hint: "Leaks, blockages, taps, toilets, hot water", next: "plumbing" },
      { id: "drainage", label: "Drainage", hint: "Blocked or smelly drains, gully traps, stormwater", next: "drainage" },
      { id: "gas", label: "Gas fitting", hint: "Gas appliances, installs, safety checks", next: "gas" },
    ],
  },

  // ── Plumbing ────────────────────────────────────────────────────────────
  plumbing: {
    id: "plumbing",
    title: "What's the problem?",
    summaryLabel: "Problem",
    options: [
      { id: "leak", label: "A leak", hint: "Dripping, seeping or flowing water", next: "leak-where" },
      { id: "blockage", label: "A blockage", hint: "Water won't drain or drains slowly", next: "block-where" },
      { id: "hot-water", label: "Hot water problem", hint: "No hot water, or not hot enough", next: "hw-type" },
      { id: "pressure", label: "Low water pressure", next: "pressure-where" },
      { id: "install", label: "Install or replace something", hint: "Taps, toilets, cylinders and more", next: "install-what" },
    ],
  },
  "leak-where": {
    id: "leak-where",
    title: "Where is the leak?",
    summaryLabel: "Location",
    options: [
      { id: "toilet", label: "Toilet", outcome: "leak-toilet", next: "leak-severity" },
      { id: "basin", label: "Bathroom basin or vanity", outcome: "leak-sink", next: "leak-severity" },
      { id: "kitchen", label: "Kitchen sink", outcome: "leak-sink", next: "leak-severity" },
      { id: "shower", label: "Shower or bath", outcome: "leak-shower", next: "leak-severity" },
      { id: "cylinder", label: "Hot water cylinder", outcome: "leak-cylinder", next: "leak-severity" },
      { id: "wall", label: "Wall, ceiling or floor", hint: "Stains, drips or a wet patch", outcome: "leak-hidden", next: "leak-severity" },
      { id: "outside", label: "Outside tap or pipe", outcome: "leak-outside", next: "leak-severity" },
    ],
  },
  "leak-severity": {
    id: "leak-severity",
    title: "How bad is it right now?",
    summaryLabel: "Severity",
    options: [
      { id: "flowing", label: "Water is flowing and I can't stop it", urgency: "urgent" },
      { id: "damage", label: "It's causing damage", hint: "Wet carpet, swollen cabinets, stained ceiling", urgency: "urgent" },
      { id: "dripping", label: "It's dripping or seeping", hint: "Annoying, but under control" },
    ],
  },
  "block-where": {
    id: "block-where",
    title: "What's blocked?",
    summaryLabel: "Location",
    options: [
      { id: "toilet", label: "Toilet", outcome: "block-toilet", next: "block-severity" },
      { id: "basin", label: "Bathroom basin", outcome: "block-basin", next: "block-severity" },
      { id: "shower", label: "Shower or bath", outcome: "block-shower", next: "block-severity" },
      { id: "kitchen", label: "Kitchen sink", outcome: "block-kitchen", next: "block-severity" },
      { id: "several", label: "More than one thing", hint: "e.g. toilet and shower both slow", outcome: "drain-main", next: "block-severity" },
    ],
  },
  "block-severity": {
    id: "block-severity",
    title: "How bad is it?",
    summaryLabel: "Severity",
    options: [
      { id: "overflowing", label: "It's overflowing or sewage is coming up", urgency: "urgent" },
      { id: "blocked", label: "It's completely blocked" },
      { id: "slow", label: "It's draining slowly" },
    ],
  },
  "hw-type": {
    id: "hw-type",
    title: "What kind of hot water system do you have?",
    subtitle: "Not sure? Electric cylinders are the most common in Auckland homes.",
    summaryLabel: "System",
    options: [
      { id: "electric", label: "Electric cylinder", hint: "A tall tank, usually in a cupboard", next: "hw-symptom" },
      { id: "gas", label: "Gas", hint: "Continuous-flow unit, often on an outside wall", outcome: "gas-appliance" },
      { id: "other", label: "Heat pump, solar or not sure", outcome: "hw-other" },
    ],
  },
  "hw-symptom": {
    id: "hw-symptom",
    title: "What's happening?",
    summaryLabel: "Symptom",
    options: [
      { id: "none", label: "No hot water at all", outcome: "hw-none" },
      { id: "lukewarm", label: "It's not hot enough or runs out fast", outcome: "hw-lukewarm" },
      { id: "leaking", label: "The cylinder is leaking", outcome: "leak-cylinder", urgency: "urgent" },
    ],
  },
  "pressure-where": {
    id: "pressure-where",
    title: "Where is the pressure low?",
    summaryLabel: "Location",
    options: [
      { id: "everywhere", label: "Every tap in the house", outcome: "pressure-house" },
      { id: "one", label: "Just one tap or shower", outcome: "pressure-one" },
      { id: "hot", label: "Only the hot water", outcome: "pressure-hot" },
    ],
  },
  "install-what": {
    id: "install-what",
    title: "What would you like installed or replaced?",
    summaryLabel: "Install",
    options: [
      { id: "tap", label: "Tap or mixer", outcome: "install-tap" },
      { id: "toilet", label: "Toilet", outcome: "install-toilet" },
      { id: "cylinder", label: "Hot water cylinder", outcome: "install-cylinder" },
      { id: "other", label: "Something else", hint: "Dishwasher, filter, outside tap and more", outcome: "install-other" },
    ],
  },

  // ── Drainage ────────────────────────────────────────────────────────────
  drainage: {
    id: "drainage",
    title: "What's going on with your drains?",
    summaryLabel: "Problem",
    options: [
      { id: "gully", label: "Gully trap overflowing", hint: "The drain outside, usually by the kitchen or laundry", outcome: "drain-gully", urgency: "urgent" },
      { id: "several", label: "Several fixtures blocked or gurgling", outcome: "drain-main" },
      { id: "smell", label: "Bad smell", outcome: "drain-smell" },
      { id: "stormwater", label: "Stormwater or downpipe problem", hint: "Water pooling, downpipes overflowing", outcome: "drain-stormwater" },
      { id: "damaged", label: "Damaged drain or tree roots", hint: "Sinking ground, wet patches, recurring blockages", outcome: "drain-damaged" },
      { id: "cctv", label: "Drain camera inspection", hint: "Buying a house, or want to know what's down there", outcome: "drain-cctv" },
    ],
  },

  // ── Gas ─────────────────────────────────────────────────────────────────
  gas: {
    id: "gas",
    title: "What do you need?",
    summaryLabel: "Problem",
    options: [
      { id: "smell", label: "I can smell gas", hint: "Get safety steps straight away", outcome: "gas-smell", urgency: "emergency" },
      { id: "appliance", label: "A gas appliance isn't working", next: "gas-appliance" },
      { id: "install", label: "Install a gas appliance", next: "gas-install" },
      { id: "cert", label: "Safety check or gas certificate", outcome: "gas-cert" },
    ],
  },
  "gas-appliance": {
    id: "gas-appliance",
    title: "Which appliance?",
    summaryLabel: "Appliance",
    options: [
      { id: "hob", label: "Hob or oven", outcome: "gas-appliance" },
      { id: "hot-water", label: "Hot water unit", outcome: "gas-appliance" },
      { id: "heater", label: "Heater or fire", outcome: "gas-appliance" },
      { id: "other", label: "Something else", outcome: "gas-appliance" },
    ],
  },
  "gas-install": {
    id: "gas-install",
    title: "What would you like installed?",
    summaryLabel: "Install",
    options: [
      { id: "hob", label: "Gas hob or oven", outcome: "gas-install" },
      { id: "hot-water", label: "Gas hot water", outcome: "gas-install" },
      { id: "heater", label: "Gas heater or fire", outcome: "gas-install" },
      { id: "bbq", label: "Outdoor gas point or BBQ", outcome: "gas-install" },
      { id: "lpg", label: "LPG bottle connection", outcome: "gas-install" },
    ],
  },
};

const outcomeList: Outcome[] = [
  // ── Plumbing: leaks ─────────────────────────────────────────────────────
  {
    id: "leak-toilet",
    service: "plumbing",
    title: "Leaking toilet",
    summary:
      "Most toilet leaks come from the cistern (water running into the bowl), the supply hose, or the seal at the base.",
    urgency: "standard",
    price: callOut,
    tips: [
      "Turn the isolating valve behind or beside the toilet clockwise to stop the water. A flat-head screwdriver usually does it.",
      "Work out where the water is coming from: dry everything with a towel, then watch where it reappears.",
      "To check for a silent cistern leak, add a few drops of food colouring to the cistern. If colour shows in the bowl after 15 minutes without flushing, the cistern washer or valve needs replacing.",
      "Lift the cistern lid and check the float isn't stuck on something.",
    ],
    callIf: [
      "Water is coming from the base of the toilet. A failed seal can rot the floor underneath.",
      "The porcelain is cracked.",
      "You can't turn off the isolating valve, or there isn't one.",
    ],
  },
  {
    id: "leak-sink",
    service: "plumbing",
    title: "Leak at a sink or vanity",
    summary: "Leaks under sinks usually come from the tap hoses, the tap itself, or the waste pipe joints.",
    urgency: "standard",
    price: callOut,
    tips: [
      "Turn off the isolating valves under the sink (the small taps on the hoses) to stop water to the tap.",
      "Check the flexible hoses. If one is bulging, rusty or frayed, turn the water off now. These can burst without warning.",
      "If it only leaks when you drain the sink, check the plastic waste nuts are hand-tight. Don't over-tighten them.",
      "Put a container under the leak and keep the cabinet dry so the base doesn't swell.",
    ],
    callIf: [
      "A flexible hose is damaged. It needs replacing, not tightening.",
      "The tap drips constantly or leaks from the body. It needs a new washer or cartridge.",
      "The vanity or cabinet base has swollen or gone soft.",
    ],
  },
  {
    id: "leak-shower",
    service: "plumbing",
    title: "Leaking shower or bath",
    summary:
      "Shower leaks can be a dripping mixer, a failed seal, or water escaping through the walls or floor, which is the one to catch early.",
    urgency: "standard",
    price: callOut,
    tips: [
      "Note when it leaks: only while showering points to a seal or waterproofing; all the time points to the mixer or a pipe.",
      "Check the silicone around the tray, bath and glass for gaps, mould or peeling.",
      "Look for staining, flaking paint or swollen skirting in the rooms next to and below the shower.",
      "Make sure the mixer is turned fully off. A dripping shower head is often just a worn cartridge.",
    ],
    callIf: [
      "You can see water damage in the next room, or the ceiling below.",
      "The floor near the shower feels soft or tiles are loose.",
      "The mixer keeps dripping when it's fully off.",
    ],
  },
  {
    id: "leak-cylinder",
    service: "plumbing",
    title: "Leaking hot water cylinder",
    summary:
      "A leaking cylinder needs attention quickly. It might be a valve, a fitting, or the tank itself failing.",
    urgency: "urgent",
    price: { label: "Hot water repair from", amount: pricing.from.hotWaterRepair },
    tips: [
      "Turn the cylinder off at the switchboard. It's usually labelled \"HWC\" or \"Hot water\".",
      "Close the cold water valve on the pipe going into the cylinder, or turn off the water at the toby.",
      "Some valves on top of the cylinder release a little water while it heats. A few drips into the tundish is normal; a constant flow is not.",
      "Move anything valuable out of the cupboard and keep the floor dry.",
    ],
    callIf: [
      "Water is coming from the tank itself. That usually means it needs replacing.",
      "A valve is running constantly.",
      "Your cylinder is 15 years old or more.",
    ],
  },
  {
    id: "leak-hidden",
    service: "plumbing",
    title: "Leak in a wall, ceiling or floor",
    summary: "Hidden leaks do damage before you see them, so it pays to find them fast.",
    urgency: "standard",
    price: callOut,
    tips: [
      "Turn off the water at the toby, usually near your front boundary under a small lid.",
      "If water is near light fittings, switches or power points, turn off the power at the switchboard.",
      "Stay out from under a ceiling that's sagging or bulging.",
      "Take photos of the stains or damage. They help us and your insurer.",
    ],
    callIf: ["You can see a wet patch, staining or a drip from inside a wall or ceiling. These need a plumber to find and fix."],
  },
  {
    id: "leak-outside",
    service: "plumbing",
    title: "Outside tap or pipe leak",
    summary: "Outside leaks are easy to miss and can quietly push up your water bill.",
    urgency: "standard",
    price: callOut,
    tips: [
      "Make sure the tap is fully closed and check the hose connector, which is often the real culprit.",
      "To check for a hidden underground leak, turn off every tap inside and out, then watch your water meter for 15 minutes. If it moves, water is escaping somewhere.",
      "Look for unusually green or soggy patches in the lawn.",
    ],
    callIf: ["The meter keeps moving with everything off.", "The tap keeps dripping when it's fully closed.", "A pipe is visibly cracked or split."],
  },

  // ── Plumbing: blockages ─────────────────────────────────────────────────
  {
    id: "block-toilet",
    service: "plumbing",
    title: "Blocked toilet",
    summary: "Most blocked toilets clear with a good plunger. If it keeps happening, the problem may be further down the pipe.",
    urgency: "diy",
    price: { label: "Blockage clearing from", amount: pricing.from.blockedDrain },
    tips: [
      "Don't keep flushing. It can make the bowl overflow.",
      "Use a toilet plunger with a flange (the rubber flap underneath). Get a good seal and give 10–15 firm pushes.",
      "Pour a bucket of hot (not boiling) water with a squirt of dish liquid into the bowl from waist height, then wait 10 minutes.",
      "Avoid chemical drain cleaners. They rarely work on toilets and can damage pipes.",
    ],
    callIf: [
      "Other drains are gurgling or slow too. The main drain may be blocked.",
      "Water is coming up through the gully trap outside.",
      "Something solid has been flushed, like a toy, nappy or phone.",
    ],
  },
  {
    id: "block-basin",
    service: "plumbing",
    title: "Blocked bathroom basin",
    summary: "Basin blockages are usually hair and soap build-up just below the plug.",
    urgency: "diy",
    price: { label: "Blockage clearing from", amount: pricing.from.blockedDrain },
    tips: [
      "Pull out or unscrew the pop-up plug and clear the hair from it.",
      "Cover the overflow hole with a wet cloth, then use a small plunger over the plughole.",
      "Run hot tap water with a little dish liquid for a minute.",
    ],
    callIf: ["It's still blocked after plunging.", "The basin and other fixtures are slow at the same time."],
  },
  {
    id: "block-shower",
    service: "plumbing",
    title: "Blocked shower or bath",
    summary: "Hair is almost always the cause. It collects just under the grate.",
    urgency: "diy",
    price: { label: "Blockage clearing from", amount: pricing.from.blockedDrain },
    tips: [
      "Lift the waste grate and pull out the hair. A cheap plastic drain snake from the hardware store works well.",
      "Use a plunger over the waste. For a bath, cover the overflow with a wet cloth first.",
      "Fit a hair catcher to stop it happening again.",
    ],
    callIf: ["Water is backing up into the shower from somewhere else.", "It's still slow after you've cleared the hair."],
  },
  {
    id: "block-kitchen",
    service: "plumbing",
    title: "Blocked kitchen sink",
    summary: "Kitchen blockages are usually fat, oil and food scraps that set in the pipe.",
    urgency: "diy",
    price: { label: "Blockage clearing from", amount: pricing.from.blockedDrain },
    tips: [
      "Use a plunger over the plughole. With a double sink, block the other plughole with a wet cloth.",
      "Pour in hot (not boiling) water with dish liquid to soften fat, then plunge again.",
      "If you have a waste disposal, switch it off at the wall and press the reset button underneath.",
      "In future, wipe greasy pans with a paper towel before washing.",
    ],
    callIf: ["The gully trap outside is overflowing.", "The dishwasher or laundry is backing up into the sink."],
  },

  // ── Plumbing: hot water ─────────────────────────────────────────────────
  {
    id: "hw-none",
    service: "plumbing",
    title: "No hot water (electric cylinder)",
    summary: "Often it's a power issue rather than the cylinder itself, so check the simple things first.",
    urgency: "diy",
    price: { label: "Hot water repair from", amount: pricing.from.hotWaterRepair },
    tips: [
      "Check the cylinder switch on the wall near the cylinder (if you have one) is on.",
      "Check your switchboard. If the hot water breaker has tripped, reset it once. If it trips again, leave it off and call us.",
      "Some homes are on controlled (night) rates and only heat at certain times. Check with your power company.",
    ],
    callIf: ["The breaker trips again after resetting.", "You still have no hot water after a few hours with the power on."],
  },
  {
    id: "hw-lukewarm",
    service: "plumbing",
    title: "Hot water not hot enough",
    summary: "This is usually a failing element or thermostat, or a cylinder that's too small for the household.",
    urgency: "standard",
    price: { label: "Hot water repair from", amount: pricing.from.hotWaterRepair },
    tips: [
      "Think about whether anything has changed. More people in the house, or longer showers, can simply outrun the cylinder.",
      "Check whether your power plan limits heating to certain times.",
      "Don't adjust the thermostat yourself. Cylinders must store water at 60°C or more to prevent Legionella.",
    ],
    callIf: ["It has gradually got worse over weeks.", "The cylinder is 15 years old or more."],
  },
  {
    id: "hw-other",
    service: "plumbing",
    title: "Heat pump or solar hot water",
    summary: "These systems have their own controls and error codes, which are worth checking first.",
    urgency: "standard",
    price: { label: "Hot water repair from", amount: pricing.from.hotWaterRepair },
    tips: [
      "Check the system's power supply and switchboard breaker.",
      "Look for an error code on the controller and note it down. It helps us diagnose it.",
      "Check the manual or manufacturer's website for a troubleshooting guide.",
    ],
    callIf: ["There's an error code you can't clear.", "The unit is leaking or making unusual noises."],
  },

  // ── Plumbing: pressure ──────────────────────────────────────────────────
  {
    id: "pressure-house",
    service: "plumbing",
    title: "Low pressure throughout the house",
    summary: "When every tap is weak, the cause is usually at the supply end.",
    urgency: "diy",
    price: callOut,
    tips: [
      "Check that the toby (the valve at your boundary) is fully open.",
      "Ask a neighbour if their pressure is low too, and check Watercare's website for outages or work in your street.",
      "Check for leaks: if the water meter moves with every tap off, water is escaping somewhere.",
    ],
    callIf: ["Your neighbours' pressure is fine and the toby is fully open.", "The meter moves with everything off."],
  },
  {
    id: "pressure-one",
    service: "plumbing",
    title: "Low pressure at one tap or shower",
    summary: "One weak outlet usually means a blocked aerator, shower head or valve.",
    urgency: "diy",
    price: callOut,
    tips: [
      "Unscrew the aerator on the end of the tap and rinse out any grit.",
      "Soak the shower head in white vinegar overnight to dissolve limescale.",
      "Check the isolating valve under the sink is fully open.",
    ],
    callIf: ["It's still weak after cleaning.", "The tap or mixer is old or stiff."],
  },
  {
    id: "pressure-hot",
    service: "plumbing",
    title: "Low hot water pressure",
    summary: "If only the hot is weak, it's usually your cylinder type or one of its valves.",
    urgency: "standard",
    price: { label: "Hot water repair from", amount: pricing.from.hotWaterRepair },
    tips: [
      "Older low-pressure cylinders (often with a pipe venting through the roof) give weak hot water by design.",
      "Check whether hot water is weak at every tap, or only one.",
    ],
    callIf: ["It used to be fine and has dropped recently.", "You'd like to upgrade to a mains-pressure cylinder."],
  },

  // ── Plumbing: installs ──────────────────────────────────────────────────
  {
    id: "install-tap",
    service: "plumbing",
    title: "Tap or mixer installation",
    summary: "We can fit a tap you've bought, or supply one for you.",
    urgency: "standard",
    price: { label: "Tap installation from", amount: pricing.from.tapInstall },
    tips: [
      "Take a photo of the existing tap and the pipes underneath. It helps us bring the right fittings.",
      "Make sure the new tap is suitable for your water pressure (mains or low pressure).",
      "Buy from an NZ supplier so it meets local standards.",
    ],
    callIf: ["Replacing taps is sanitary plumbing and must be done by a licensed plumber."],
  },
  {
    id: "install-toilet",
    service: "plumbing",
    title: "Toilet installation",
    summary: "Replacing a toilet is a half-day job for us, including removing the old one.",
    urgency: "standard",
    price: { label: "Toilet installation from", amount: pricing.from.toiletInstall },
    tips: [
      "Measure from the wall to the centre of the outlet (the \"set-out\") so your new toilet fits.",
      "Check whether your current toilet goes into the floor or the wall.",
      "Take a photo of the toilet and where the water connects.",
    ],
    callIf: ["Installing a toilet must be done by a licensed plumber."],
  },
  {
    id: "install-cylinder",
    service: "plumbing",
    title: "Hot water cylinder replacement",
    summary: "We'll help you choose the right size and type for your household, and handle the install and compliance.",
    urgency: "standard",
    price: { label: "Cylinder replacement from", amount: pricing.from.cylinderReplace },
    tips: [
      "Take a photo of the label on your current cylinder. It shows the size and age.",
      "As a rough guide: 135L for 1–2 people, 180L for 3–4, 250L or more for 5+.",
      "Measure the cupboard space, including the door width.",
    ],
    callIf: ["Cylinder replacement must be done by a licensed plumber and may need a building consent."],
  },
  {
    id: "install-other",
    service: "plumbing",
    title: "Plumbing installation",
    summary: "From dishwashers to water filters, tell us what you'd like and we'll quote it.",
    urgency: "standard",
    price: callOut,
    tips: ["Have the product model number handy, and a photo of where it's going."],
    callIf: ["Connecting appliances to the water supply or waste must be done by a licensed plumber."],
  },

  // ── Drainage ────────────────────────────────────────────────────────────
  {
    id: "drain-main",
    service: "drainage",
    title: "Main drain blockage",
    summary: "When several fixtures are slow or gurgling at once, the blockage is usually in the main drain outside.",
    urgency: "standard",
    price: { label: "Drain unblocking from", amount: pricing.from.blockedDrain },
    tips: [
      "Stop using water as much as possible: no flushing, showers or washing machine.",
      "Check the gully trap outside. If it's overflowing, the blockage is past it.",
      "Don't use chemical drain cleaners. They won't reach a main drain blockage.",
    ],
    callIf: ["Several fixtures are blocked at once. This needs drain-clearing equipment."],
  },
  {
    id: "drain-gully",
    service: "drainage",
    title: "Overflowing gully trap",
    summary: "An overflowing gully trap means the drain beyond it is blocked, often by fat, roots or debris.",
    urgency: "urgent",
    price: { label: "Drain unblocking from", amount: pricing.from.blockedDrain },
    tips: [
      "Stop using the kitchen, laundry and bathroom until it's cleared.",
      "Lift the grate and clear any leaves or debris sitting on top. Wear gloves.",
      "Keep children and pets away from any wastewater.",
    ],
    callIf: ["It's still overflowing after you've cleared the grate.", "There's sewage in the water."],
  },
  {
    id: "drain-smell",
    service: "drainage",
    title: "Drain smell",
    summary: "Most drain smells come from a dried-out trap or build-up in a waste pipe.",
    urgency: "diy",
    price: callOut,
    tips: [
      "Run water for a minute in sinks, showers and floor wastes you rarely use. That refills the trap, which blocks smells.",
      "Check the gully trap outside has water in it and isn't full of debris.",
      "Clean the kitchen sink plughole and basket with hot water and dish liquid.",
    ],
    callIf: ["The smell keeps coming back.", "It smells strongly of sewage inside the house."],
  },
  {
    id: "drain-stormwater",
    service: "drainage",
    title: "Stormwater or downpipe problem",
    summary: "Overflowing downpipes and pooling water are usually blocked gutters, downpipes or stormwater drains.",
    urgency: "diy",
    price: { label: "Drain unblocking from", amount: pricing.from.blockedDrain },
    tips: [
      "Clear leaves from gutters and downpipe outlets, if you can do it safely from the ground or a secure ladder.",
      "Check the grate on any stormwater sump and clear debris.",
      "Note where the water pools during heavy rain and take a photo.",
    ],
    callIf: ["Downpipes still overflow when the gutters are clear.", "Water is pooling near the house or getting under it."],
  },
  {
    id: "drain-damaged",
    service: "drainage",
    title: "Damaged drain or tree roots",
    summary: "Cracked or root-filled drains cause recurring blockages and can undermine the ground above them.",
    urgency: "standard",
    price: { label: "Drain camera inspection from", amount: pricing.from.cctv },
    tips: ["Keep off any area of ground that's sinking.", "Note where blockages, wet patches or smells keep coming back."],
    callIf: ["Repairing drains is drainlaying work and must be done by a registered drainlayer. We'll start with a camera inspection."],
  },
  {
    id: "drain-cctv",
    service: "drainage",
    title: "Drain camera inspection",
    summary: "We send a camera through your drains and give you a recorded report, which is ideal before buying a house.",
    urgency: "standard",
    price: { label: "Drain camera inspection from", amount: pricing.from.cctv },
    tips: ["Find out where the gully traps and inspection points are, or ask the owner if you're buying."],
    callIf: [],
  },

  // ── Gas ─────────────────────────────────────────────────────────────────
  {
    id: "gas-smell",
    service: "gas-fitting",
    title: "You can smell gas",
    summary: "Act now. Follow these steps before anything else.",
    urgency: "emergency",
    price: gasCallOut,
    tips: [
      "Don't turn any switches, lights or appliances on or off, and don't use flames.",
      "Turn off the gas at the meter or the LPG bottle, if you can do it safely.",
      "Open doors and windows.",
      "Leave the house and call your gas supplier's emergency line from outside.",
      "If anyone feels unwell or is in danger, call 111.",
    ],
    callIf: ["Once the supplier has made it safe, book us to find and repair the leak."],
  },
  {
    id: "gas-appliance",
    service: "gas-fitting",
    title: "Gas appliance not working",
    summary: "There are a few safe checks you can do. Anything inside the appliance must be left to a licensed gasfitter.",
    urgency: "standard",
    price: gasCallOut,
    tips: [
      "Check other gas appliances work. If none do, check the meter valve is open, or that your LPG bottle isn't empty.",
      "Most gas appliances also need power for ignition. Check it's plugged in and switched on.",
      "Note any error code or flashing light on the display.",
      "Never take covers off or try to repair a gas appliance yourself.",
    ],
    callIf: ["The flame is yellow, orange or sooty.", "The pilot light won't stay lit.", "You can smell gas. Follow the gas smell steps first."],
  },
  {
    id: "gas-install",
    service: "gas-fitting",
    title: "Gas appliance installation",
    summary: "We install natural gas and LPG appliances and provide the gas certificate.",
    urgency: "standard",
    price: { label: "Gas installation from", amount: pricing.from.gasInstall },
    tips: [
      "Have the appliance model number ready, or a link to it.",
      "Take a photo of where it's going, and of your gas meter or bottles.",
    ],
    callIf: ["All gas installation must be done by a licensed gasfitter."],
  },
  {
    id: "gas-cert",
    service: "gas-fitting",
    title: "Gas safety check or certificate",
    summary: "We check your appliances and pipework and issue a certificate, which is useful for landlords and house sales.",
    urgency: "standard",
    price: { label: "Gas safety check from", amount: pricing.from.gasCertificate },
    tips: ["List the gas appliances in the house so we can allow enough time."],
    callIf: [],
  },
];

export const outcomes: Record<string, Outcome> = Object.fromEntries(outcomeList.map((o) => [o.id, o]));

const urgencyRank: Record<Urgency, number> = { diy: 0, standard: 1, urgent: 2, emergency: 3 };

export type Step = { question: Question; option: Option };

export type FinderState = {
  /** Answers that matched a question, in order. */
  steps: Step[];
  /** The question to ask next, or null when finished. */
  current: Question | null;
  outcome: Outcome | null;
  urgency: Urgency | null;
};

/** Replays a list of answer ids through the tree. Unknown ids are dropped. */
export function resolve(answers: string[]): FinderState {
  const steps: Step[] = [];
  let current: Question | null = questions[ROOT];
  let outcomeId: string | undefined;
  let urgency: Urgency | null = null;

  for (const id of answers) {
    if (!current) break;
    const option: Option | undefined = current.options.find((o) => o.id === id);
    if (!option) break;
    steps.push({ question: current, option });
    if (option.outcome) outcomeId = option.outcome;
    if (option.urgency && (!urgency || urgencyRank[option.urgency] > urgencyRank[urgency])) urgency = option.urgency;
    current = option.next ? questions[option.next] : null;
  }

  const outcome = !current && outcomeId ? outcomes[outcomeId] : null;
  let finalUrgency: Urgency | null = null;
  if (outcome) {
    finalUrgency =
      urgency && urgencyRank[urgency] > urgencyRank[outcome.urgency] ? urgency : outcome.urgency;
  }
  return { steps, current, outcome, urgency: finalUrgency };
}

/** Longest number of questions left from a given question (for the progress bar). */
export function stepsRemaining(q: Question | null): number {
  if (!q) return 0;
  return 1 + Math.max(...q.options.map((o) => (o.next ? stepsRemaining(questions[o.next]) : 0)));
}

/** Link that opens the finder with the service already chosen. */
const serviceAnswer: Record<ServiceSlug, string> = { plumbing: "plumbing", drainage: "drainage", "gas-fitting": "gas" };
export const finderHref = (service: ServiceSlug) => `/get-started?a=${serviceAnswer[service]}`;
