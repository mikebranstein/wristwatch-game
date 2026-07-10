'use strict';

function createTemplates(watchTypeFlavor, templatePoolId, texts) {
  return texts.map((text, index) => ({
    id: `template_${watchTypeFlavor}_${String(index + 1).padStart(3, '0')}`,
    template_pool_id: templatePoolId,
    text,
    watch_type_flavor: watchTypeFlavor,
  }));
}

const BACKSTORY_TEMPLATES = [
  ...createTemplates('dive', 'pool_dive', [
    'A salt-stiff dive watch arrives with the smell of old rope and diesel still clinging to it. Its owner wants it ready before the next charter leaves the harbor at dawn.',
    'This diver rode through a storm season lashed to a skipper’s wrist. Now the bezel sticks, and the watch needs one more honest rescue before it goes back to sea.',
    'Scratches cloud the crystal like surf on dark rock. The client says the watch kept them company through lonely midnight descents and deserves another season underwater.',
    'A faded decompression table is folded into the repair note beside this watch. Its owner wants the movement steady again before a memorial dive for an old friend.',
    'The case back still carries grains of coral dust from a long-closed expedition. Restoring it means giving a veteran diver one last dependable instrument.',
    'The lume has gone dim, but the watch still looks ready to meet black water. The client wants it revived before teaching their first class of the summer.',
    'A rescue diver brings this piece in wrapped with a tide chart and a careful apology for waiting so long. They want it sealed, timed, and trusted again.',
    'The watch survived years in a gear bag beside fins and rusted clips. Now a new boat, a new crew, and an old companion all need to be ready together.',
    'Its crown threads complain with every turn, as if sand never truly left them. The client says this watch belongs on a reef, not silent in a drawer.',
    'This diver once timed every ascent on the same scarred bezel. Bringing it back means sending a lucky charm home to the water where it earned its name.',
  ]),
  ...createTemplates('dress', 'pool_dress', [
    'A slim gold dress watch arrives in a velvet pouch with a note about an anniversary dinner. The client wants its quiet elegance returned before the candles are lit.',
    'This watch spent decades attending weddings, galas, and difficult family truces. Now it needs a careful hand so it can dress for one more important evening.',
    'The dial has aged to the color of old champagne. Its owner wants it ticking again before a long-delayed reunion at the same hotel where it was first worn.',
    'A cracked crystal hides a watch once reserved for moments that mattered. The client says a promotion ceremony feels incomplete without it on their wrist.',
    'This piece carries the polish of ballroom light and years of careful storage. It is being restored for a daughter who remembers it from every holiday photograph.',
    'The strap is new, the movement is not, and both need to agree before a retirement banquet next month. The client wants grace, not novelty, from the repair.',
    'A tiny engraved date on the case back marks the day two families became one. Bringing the watch back is meant to mark that story for another generation.',
    'This dress watch was boxed away after one hard fall on marble. Its owner is finally ready to wear it again to a concert their late partner loved.',
    'The hands are frozen just before midnight, as if the evening never ended. The client wants the watch alive again for a charity gala held in that same hall.',
    'A jeweler’s receipt from years ago is tucked under the repair slip like a blessing. The client says if the watch can keep time again, the memory will feel complete.',
  ]),
  ...createTemplates('field', 'pool_field', [
    'Mud darkens the strap and the case bears the plain honesty of hard use. The client wants this field watch steady again before a volunteer supply run inland.',
    'This watch has lived through rain, dust, and more campfire nights than its owner can count. They only ask that it become dependable enough for one more season outside.',
    'A notebook of coordinates comes bundled with the repair ticket. The watch belongs to someone who learned to trust it in places where batteries and second chances both ran short.',
    'Its numerals are bright, its movement is not. The client wants the watch ready before a memorial hike retracing an old service route.',
    'This field piece once rode on a medic’s wrist through sleepless weeks. Restoring it is less about shine than making a hard-used tool answer faithfully again.',
    'The watch arrives with canvas fibers caught in the lugs and grit in the crown. Its owner says that is history, not damage, and only wants the heart repaired.',
    'Every scrape on the case tells on weather, distance, and stubbornness. The client needs it back before guiding a youth expedition through the high plains.',
    'This watch sat in a footlocker for years after duty ended. Now its owner wants to hear it tick before passing it to a niece heading into service.',
    'The lume is faint, but the watch still feels built for first light and long roads. The client wants it restored before a survey trip into rough country.',
    'An old patrol map is folded beneath the work order like a private promise. Fixing this watch means returning a trusted companion to someone who never really replaced it.',
  ]),
  ...createTemplates('pocket', 'pool_pocket', [
    'A silver pocket watch arrives wrapped in linen that smells faintly of cedar. The client wants it restored before reading a great-grandfather’s speech at the family table.',
    'The engraving inside the case has worn soft with generations of thumbs. Bringing the movement back means letting a family heirloom speak in more than silence.',
    'This watch once ruled a stationmaster’s day down to the minute. Now it waits for careful repair before it can anchor a grandson’s wedding toast.',
    'A cracked bow and tired mainspring have kept this piece sleeping in a trunk. The client hopes to carry it at a reunion of relatives who still tell its stories.',
    'The porcelain dial bears one hairline fracture and a century of restraint. Its owner wants it running again before placing it in a museum case with dignity.',
    'This pocket watch surfaced from an attic among letters tied with blue ribbon. Restoring it means pairing a living heartbeat with words that already survived the years.',
    'A jewelled movement hides inside a case gone quiet at some forgotten winter hour. The client wants it restored for the first grandchild named after the original owner.',
    'Its chain is missing, its ceremony is not. The watch is meant to ride in a waistcoat once more for a portrait that links four generations at once.',
    'The repair note mentions a railway platform farewell no one in the family witnessed. Getting the watch running again is the closest thing they have to hearing that goodbye.',
    'A careful polish will never matter as much as the first healthy tick. The client says this pocket watch has been the center of every inheritance story for fifty years.',
  ]),
  ...createTemplates('chronograph', 'pool_chronograph', [
    'A flyback chronograph lands on the bench with old lap times still penciled into its booklet. The client wants it alive before returning to the track where they first learned courage.',
    'This chronograph timed pit stops, sprint heats, and one life-changing confession in the paddock. Now the pushers drag, and the owner wants crisp starts and stops again.',
    'Oil has thickened beneath the hands that once chased every fraction of a second. The client says the watch belongs courtside for a comeback season already underway.',
    'A racing strap, worn nearly smooth, suggests this watch never cared about being ornamental. It needs a full revival before the client hands it to their son after his first podium.',
    'The sweep seconds hand stutters like an old engine turning over in winter. Restoring it means returning a beloved instrument to someone who still measures life in split times.',
    'This chronograph was worn by a coach who timed every drill by instinct and habit. The client wants it ready for the scholarship ceremony that bears that coach’s name.',
    'The case carries a dent from an ecstatic celebration that no one regrets. Now the movement needs steadier luck before the next charity rally begins.',
    'A set of engraved initials on the clasp marks this as a gift between teammates. The client wants it repaired before their reunion dinner at the same circuit clubhouse.',
    'This watch once started every training interval with a satisfying click. Its owner misses that sound almost as much as the discipline it represented.',
    'The chronograph bridge is tired, but the story around it is not. The client says if the watch can time one more victory lap, that will be enough.',
  ]),
  ...createTemplates('generic', 'pool_generic', [
    'The watch arrives with a simple request: make it live again. Even without the full history, the wear on the case suggests it has earned another chapter.',
    'A careful owner brings in a watch that has outlasted fashions, moves, and quiet losses. Restoring it is a small act of respect for time already spent together.',
    'No dramatic story is written on the ticket, only a hope that this old companion can tick again. Sometimes that is more than enough reason to begin.',
    'The case shows years of patient use and one abrupt failure. The client would like the watch back in service before another ordinary day becomes meaningful.',
    'This piece may not be famous, but it was clearly relied upon. The bench offers it the same dignity as any heirloom with a louder history.',
  ]),
];

module.exports = { BACKSTORY_TEMPLATES };
