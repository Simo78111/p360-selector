export type ServiceSlug = "plumbing" | "drainage" | "gas-fitting";

export type Service = {
  slug: ServiceSlug;
  name: string;
  short: string;
  intro: string;
  jobs: string[];
  diy: string[];
  callUs: string[];
};

export const services: Service[] = [
  {
    slug: "plumbing",
    name: "Plumbing",
    short: "Leaks, taps, toilets, showers and hot water.",
    intro:
      "From a dripping tap to a hot water cylinder that has given up, our certifying plumbers handle the everyday jobs that keep an Auckland home running.",
    jobs: [
      "Leaking taps, pipes and mixers",
      "Toilets that run, leak or won't flush",
      "Shower and basin repairs",
      "Hot water cylinders: repairs and replacement",
      "Water pressure problems",
      "Kitchen and bathroom fit-offs",
    ],
    diy: [
      "Find your water toby (usually at the front boundary) so you can turn the water off fast.",
      "A running toilet is often just a worn cistern washer. Lift the lid and check the float isn't stuck.",
      "No hot water? Check the cylinder's switch on your switchboard before anything else.",
    ],
    callUs: [
      "Water is coming through a ceiling or wall",
      "You can't stop a leak by turning off the tap or toby",
      "Your hot water cylinder is leaking or the relief valve won't stop running",
    ],
  },
  {
    slug: "drainage",
    name: "Drainage",
    short: "Blocked drains, CCTV inspections and drain repairs.",
    intro:
      "Blocked or broken drains get worse with time. Our registered drainlayers find the cause, clear it properly and repair what's damaged.",
    jobs: [
      "Blocked sinks, showers and toilets",
      "Blocked gully traps and outside drains",
      "CCTV drain inspections",
      "Tree root removal",
      "Drain repairs and replacement",
      "Stormwater drainage",
    ],
    diy: [
      "For a slow kitchen sink, a plunger and a kettle of hot (not boiling) water often clear fat build-up.",
      "Check the gully trap outside: clear leaves or debris from the grate.",
      "Skip harsh chemical cleaners. They can damage older pipes and make the job harder.",
    ],
    callUs: [
      "More than one fixture is blocked at the same time",
      "Sewage is coming up through a gully trap or shower",
      "Blockages keep coming back",
    ],
  },
  {
    slug: "gas-fitting",
    name: "Gas fitting",
    short: "Gas hobs, hot water, heaters and safety checks.",
    intro:
      "Gas work must be done by a licensed gasfitter. We install, service and repair natural gas and LPG appliances, and issue the certificates you need.",
    jobs: [
      "Gas hob and oven installs",
      "Continuous-flow gas hot water",
      "Gas heater installs and servicing",
      "LPG bottle connections",
      "Gas leak detection",
      "Gas safety certificates",
    ],
    diy: [
      "Keep the area around gas appliances clear and well ventilated.",
      "Check the pilot light or ignition if a gas hot water unit stops working. Never try to repair the unit yourself.",
      "Get gas appliances serviced regularly to keep them safe and efficient.",
    ],
    callUs: [
      "You smell gas: turn off the gas at the meter or bottle, open windows, don't use switches, leave and call your gas supplier's emergency line",
      "A gas appliance has a yellow or sooty flame",
      "You want any gas appliance installed, moved or repaired",
    ],
  },
];

export const getService = (slug: string) => services.find((s) => s.slug === slug);
