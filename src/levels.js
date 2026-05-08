// Returns the next level id in canonical order, or null when at the end.
export function nextLevelId(currentId) {
  const idx = LEVELS.findIndex(l => l.id === currentId);
  if (idx < 0 || idx + 1 >= LEVELS.length) return null;
  return LEVELS[idx + 1].id;
}

// Pick any level id at random.
export function pickRandomLevelId() {
  return LEVELS[Math.floor(Math.random() * LEVELS.length)].id;
}

// Curated worlds for v1. Each level resolves to assets/emoji/{codepoint}.png.
export const WORLDS = [
  { id: 'faces',    title: 'Faces' },
  { id: 'animals',  title: 'Animals' },
  { id: 'food',     title: 'Food' },
  { id: 'vehicles', title: 'Vehicles' },
  { id: 'objects',  title: 'Objects' },
];

export const LEVELS = [
  // Faces
  { id: 'faces-01', world: 'faces', codepoint: '1f600', name: 'Grinning' },
  { id: 'faces-02', world: 'faces', codepoint: '1f602', name: 'Joy' },
  { id: 'faces-03', world: 'faces', codepoint: '1f60e', name: 'Cool' },
  { id: 'faces-04', world: 'faces', codepoint: '1f914', name: 'Thinking' },
  { id: 'faces-05', world: 'faces', codepoint: '1f634', name: 'Sleeping' },
  { id: 'faces-06', world: 'faces', codepoint: '1f97a', name: 'Pleading' },
  { id: 'faces-07', world: 'faces', codepoint: '1f62d', name: 'Crying' },
  { id: 'faces-08', world: 'faces', codepoint: '1f621', name: 'Angry' },
  { id: 'faces-09', world: 'faces', codepoint: '1f929', name: 'Star Eyes' },
  { id: 'faces-10', world: 'faces', codepoint: '1f973', name: 'Party' },
  // Animals
  { id: 'animals-01', world: 'animals', codepoint: '1f431', name: 'Cat' },
  { id: 'animals-02', world: 'animals', codepoint: '1f436', name: 'Dog' },
  { id: 'animals-03', world: 'animals', codepoint: '1f42d', name: 'Mouse' },
  { id: 'animals-04', world: 'animals', codepoint: '1f430', name: 'Rabbit' },
  { id: 'animals-05', world: 'animals', codepoint: '1f43b', name: 'Bear' },
  { id: 'animals-06', world: 'animals', codepoint: '1f43c', name: 'Panda' },
  { id: 'animals-07', world: 'animals', codepoint: '1f438', name: 'Frog' },
  { id: 'animals-08', world: 'animals', codepoint: '1f419', name: 'Octopus' },
  { id: 'animals-09', world: 'animals', codepoint: '1f981', name: 'Lion' },
  { id: 'animals-10', world: 'animals', codepoint: '1f98a', name: 'Fox' },
  // Food
  { id: 'food-01', world: 'food', codepoint: '1f34e', name: 'Apple' },
  { id: 'food-02', world: 'food', codepoint: '1f34c', name: 'Banana' },
  { id: 'food-03', world: 'food', codepoint: '1f355', name: 'Pizza' },
  { id: 'food-04', world: 'food', codepoint: '1f354', name: 'Burger' },
  { id: 'food-05', world: 'food', codepoint: '1f369', name: 'Donut' },
  { id: 'food-06', world: 'food', codepoint: '1f353', name: 'Strawberry' },
  { id: 'food-07', world: 'food', codepoint: '1f347', name: 'Grapes' },
  { id: 'food-08', world: 'food', codepoint: '1f32e', name: 'Taco' },
  { id: 'food-09', world: 'food', codepoint: '1f363', name: 'Sushi' },
  { id: 'food-10', world: 'food', codepoint: '1f370', name: 'Cake' },
  // Vehicles
  { id: 'vehicles-01', world: 'vehicles', codepoint: '1f697', name: 'Car' },
  { id: 'vehicles-02', world: 'vehicles', codepoint: '1f695', name: 'Taxi' },
  { id: 'vehicles-03', world: 'vehicles', codepoint: '1f68c', name: 'Bus' },
  { id: 'vehicles-04', world: 'vehicles', codepoint: '1f693', name: 'Police Car' },
  { id: 'vehicles-05', world: 'vehicles', codepoint: '1f680', name: 'Rocket' },
  { id: 'vehicles-06', world: 'vehicles', codepoint: '1f6f8', name: 'UFO' },
  { id: 'vehicles-07', world: 'vehicles', codepoint: '26f5',  name: 'Sailboat' },
  { id: 'vehicles-08', world: 'vehicles', codepoint: '2708',  name: 'Plane' },
  { id: 'vehicles-09', world: 'vehicles', codepoint: '1f681', name: 'Helicopter' },
  { id: 'vehicles-10', world: 'vehicles', codepoint: '1f682', name: 'Train' },
  // Objects
  { id: 'objects-01', world: 'objects', codepoint: '1f480', name: 'Skull' },
  { id: 'objects-02', world: 'objects', codepoint: '1f47b', name: 'Ghost' },
  { id: 'objects-03', world: 'objects', codepoint: '1f383', name: 'Pumpkin' },
  { id: 'objects-04', world: 'objects', codepoint: '2b50',  name: 'Star' },
  { id: 'objects-05', world: 'objects', codepoint: '2764',  name: 'Heart' },
  { id: 'objects-06', world: 'objects', codepoint: '1f381', name: 'Gift' },
  { id: 'objects-07', world: 'objects', codepoint: '1f48e', name: 'Gem' },
  { id: 'objects-08', world: 'objects', codepoint: '26bd',  name: 'Soccer Ball' },
  { id: 'objects-09', world: 'objects', codepoint: '1f3b8', name: 'Guitar' },
  { id: 'objects-10', world: 'objects', codepoint: '2615',  name: 'Coffee' },
];

export function emojiUrl(codepoint) {
  return `assets/emoji/${codepoint}.png`;
}

export function levelById(id) {
  return LEVELS.find(l => l.id === id) || null;
}
