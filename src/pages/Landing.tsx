import { IonContent, IonIcon, IonPage, IonSpinner } from '@ionic/react';
import { arrowForwardOutline, closeOutline, leafOutline, locationOutline, searchOutline } from 'ionicons/icons';
import { equalTo, onValue, orderByChild, query } from 'firebase/database';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { database } from '../firebase';
import { getStoredInventory, getStoredRequests, inventoryFromSnapshot, inventoryRef, requestsFromSnapshot, requestsRef, type AllocationRequest, type SeedBatch, type SeedCategory } from '../data/seedlink';
import './Landing.css';

type CategoryFilter = 'All seeds' | SeedCategory;

interface SeedVariety {
  name: string;
  category: SeedCategory;
  imageUrl?: string;
  stock: number;
  locations: string[];
  batchCount: number;
  requestedLocations: string[];
  deliveredLocations: string[];
}

interface CropGuide {
  suitability: string;
  soil: string;
  fertilizer: string;
  pestControl: string;
}

const categories: CategoryFilter[] = ['All seeds', 'Rice', 'Fruit', 'Vegetables'];

function groupSeedVarieties(batches: SeedBatch[], requests: AllocationRequest[]): SeedVariety[] {
  const varieties = new Map<string, SeedVariety>();

  batches.forEach((batch) => {
    const key = `${batch.seedName.trim().toLowerCase()}-${batch.category}`;
    const variety = varieties.get(key) ?? {
      name: batch.seedName,
      category: batch.category,
      imageUrl: batch.imageUrl,
      stock: 0,
      locations: [],
      batchCount: 0,
      requestedLocations: [],
      deliveredLocations: [],
    };
    if (!variety.imageUrl && batch.imageUrl) variety.imageUrl = batch.imageUrl;
    variety.stock += Number(batch.stock) || 0;
    variety.batchCount += 1;
    const location = [batch.depot, batch.municipality].filter(Boolean).join(' · ');
    if (location && !variety.locations.includes(location)) variety.locations.push(location);
    varieties.set(key, variety);
  });

  requests.forEach((request) => {
    const key = `${request.seedName.trim().toLowerCase()}-${request.category}`;
    const variety = varieties.get(key);
    if (!variety) return;
    if (request.municipality && !variety.requestedLocations.includes(request.municipality)) variety.requestedLocations.push(request.municipality);
    if (request.status === 'delivered' && request.municipality && !variety.deliveredLocations.includes(request.municipality)) variety.deliveredLocations.push(request.municipality);
  });

  return [...varieties.values()].sort((first, second) => first.name.localeCompare(second.name));
}

function getCropGuide(seed: SeedVariety): CropGuide {
  const name = seed.name.toLowerCase();
  if (name.includes('dorian') || name.includes('durian')) {
    return {
      suitability: 'Mainit at mahalumigmig na mababang lugar na may sapat na tubig, proteksyon sa malakas na hangin, at malawak na espasyo para sa malalaking puno. Suriin ang daluyan ng tubig at dalisdis bago magtanim.',
      soil: 'Malalim, mataba, at mahusay ang drainage na loam soil. Iwasan ang lupang naiipunan ng tubig; gumamit ng soil test para sa tamang apog at sustansya.',
      fertilizer: 'Gumamit ng hinog na compost sa pagtatanim, kasunod ang balanseng pataba para sa punong namumunga. Dagdagan ang potassium bago mamulaklak at mamunga, ayon sa label ng produkto.',
      pestControl: 'Suriin linggu-linggo ang bagong usbong at bunga. Unahin ang kalinisan, pruning, fruit bagging, at biological control; gumamit lamang ng rehistradong produkto at sundin ang label.',
    };
  }
  if (seed.category === 'Fruit') {
    return {
      suitability: 'Mainit at maaraw na lupang mahusay ang drainage at may maaasahang tubig. Pumili ng lugar na angkop sa variety at protektado ang mga batang halaman sa malakas na hangin.',
      soil: 'Loam soil na mahusay ang drainage at may organikong materyal. Suriin ang pH at sustansya ng lupa bago maglagay ng soil amendments.',
      fertilizer: 'Magsimula sa compost at balanseng pataba, pagkatapos ay iakma ang nitrogen at potassium ayon sa yugto ng pananim at resulta ng soil test.',
      pestControl: 'Magsiyasat linggu-linggo, alisin ang sirang bahagi ng halaman, unahin ang traps o biological control, at gumamit lamang ng rehistradong produkto kapag kinakailangan.',
    };
  }
  if (seed.category === 'Rice') {
    return {
      suitability: 'Patag na bukirin na may maaasahang irigasyon o ulan, maayos na pilapil, at daanan para sa pagtatanim at pag-aani.',
      soil: 'Clay loam na kayang magpanatili ng tubig nang hindi matagal na naiipon. Gumamit ng soil test para sa pH at tamang sustansya.',
      fertilizer: 'Maglagay ng compost kung mayroon, pagkatapos ay hatiin ang paglalagay ng nitrogen kasama ang phosphorus at potassium ayon sa soil test at yugto ng pananim.',
      pestControl: 'Gumamit ng malinis na binhi, panatilihing malinis ang bukid, pumili ng matitibay na variety, at magsiyasat nang regular. Gumamit lamang ng rehistradong pesticide kapag kinakailangan.',
    };
  }
  return {
    suitability: 'Bukas at maaraw na lupang may maaasahang tubig at mahusay na drainage. Magpalit-palit ng taniman kung maaari upang mabawasan ang sakit ng halaman.',
    soil: 'Maluwag at matabang lupang mahusay ang drainage at may organikong materyal. Suriin ang pH at sustansya bago magtanim.',
    fertilizer: 'Pagsamahin ang compost at balanseng programa ng pataba, at iakma ang nitrogen, phosphorus, at potassium sa yugto ng pananim at resulta ng soil test.',
    pestControl: 'Magsiyasat nang regular, alisin ang may sakit na bahagi, gumamit ng crop rotation at biological control, at sundin ang label ng rehistradong pesticide.',
  };
}

const Landing: React.FC = () => {
  const { user, profile } = useAuth();
  const [batches, setBatches] = useState<SeedBatch[]>([]);
  const [requests, setRequests] = useState<AllocationRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('All seeds');
  const [search, setSearch] = useState('');
  const [selectedSeed, setSelectedSeed] = useState<SeedVariety | null>(null);

  useEffect(() => {
    if (!database) {
      setBatches(getStoredInventory());
      setIsLoading(false);
      return;
    }

    const unsubscribe = onValue(
      inventoryRef()!,
      (snapshot) => {
        setBatches(inventoryFromSnapshot(snapshot).sort((first, second) => first.seedName.localeCompare(second.seedName)));
        setLoadError('');
        setIsLoading(false);
      },
      () => {
        setLoadError('The live seed catalog is temporarily unavailable. Please try again shortly.');
        setIsLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!database) {
      setRequests(user ? getStoredRequests() : []);
      return;
    }
    if (!user || !profile) {
      setRequests([]);
      return;
    }
    const source = profile.role === 'farmer'
      ? query(requestsRef()!, orderByChild('requesterUid'), equalTo(user.uid))
      : requestsRef()!;
    return onValue(source, (snapshot) => setRequests(requestsFromSnapshot(snapshot)), () => setRequests([]));
  }, [profile, user]);

  const varieties = useMemo(() => groupSeedVarieties(batches, requests), [batches, requests]);
  const visibleSeeds = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return varieties.filter((seed) => {
      const matchesCategory = activeCategory === 'All seeds' || seed.category === activeCategory;
      const matchesSearch = !normalizedSearch || [seed.name, seed.category, ...seed.locations]
        .some((value) => value.toLowerCase().includes(normalizedSearch));
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, search, varieties]);
  const totalStock = batches.reduce((total, batch) => total + (Number(batch.stock) || 0), 0);
  const inStockCount = varieties.filter((seed) => seed.stock > 0).length;

  return (
    <IonPage>
      <IonContent className="catalog-content" fullscreen>
        <header className="catalog-header">
          <Link className="catalog-brand" to="/" aria-label="SeedLink catalog home">
            <span className="catalog-brand-mark"><img src={`${import.meta.env.BASE_URL}Agricultural%20Logo%20for%20SeedLink%20(1).png`} alt="" /></span>
            <span><strong>SeedLink</strong><small>ORIENTAL MINDORO</small></span>
          </Link>
          <nav className="catalog-nav" aria-label="Main navigation">
            <a href="#seed-catalog">Browse seeds</a>
            <Link className="catalog-signin" to="/login">Sign in <IonIcon icon={arrowForwardOutline} /></Link>
          </nav>
        </header>

        <main>
          <section className="catalog-hero">
            <div className="catalog-hero-copy">
              <p className="catalog-eyebrow"><span /> A GROWER'S GUIDE TO ORIENTAL MINDORO</p>
              <h1>Plant well.<br /><em>Grow forward.</em></h1>
              <p className="catalog-hero-description">Explore seed varieties and available depot stock from across Oriental Mindoro, all in one place.</p>
              <div className="catalog-hero-actions">
                <a className="catalog-primary-action" href="#seed-catalog">Find your next seed <IonIcon icon={arrowForwardOutline} /></a>
                <Link className="catalog-secondary-action" to="/signup">Join as a local grower</Link>
              </div>
              <div className="catalog-hero-note"><span className="catalog-live-dot" /> Stock shared by participating local depots</div>
            </div>
            <div className="catalog-hero-image" role="img" aria-label="Lush green agricultural fields in the morning">
              <div className="catalog-image-caption"><span>GROWN LOCALLY</span><strong>Oriental Mindoro</strong></div>
              <div className="catalog-image-index">FIELD NOTES&nbsp; / &nbsp;01</div>
            </div>
          </section>

          <section className="catalog-stats" aria-label="Seed catalog overview">
            <div><strong>{varieties.length}</strong><span>seed varieties</span></div>
            <div><strong>{inStockCount}</strong><span>currently available</span></div>
            <div><strong>{totalStock.toLocaleString()}</strong><span>bags across the province</span></div>
            <p>Local supply, clearly connected.</p>
          </section>

          <section className="seed-catalog" id="seed-catalog" aria-labelledby="seed-catalog-title">
            <div className="seed-catalog-heading">
              <div>
                <p className="catalog-eyebrow">THE CATALOG</p>
                <h2 id="seed-catalog-title">Find your next seed</h2>
                <p>Browse varieties and see where they're available.</p>
              </div>
              <label className="catalog-search">
                <IonIcon icon={searchOutline} />
                <input aria-label="Search seeds or locations" placeholder="Search seeds or locations" value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
            </div>

            <div className="catalog-filter-row">
              <div className="catalog-filters" role="group" aria-label="Filter by seed category">
                {categories.map((category) => (
                  <button
                    className={activeCategory === category ? 'catalog-filter is-active' : 'catalog-filter'}
                    key={category}
                    onClick={() => setActiveCategory(category)}
                    type="button"
                    aria-pressed={activeCategory === category}
                  >{category}</button>
                ))}
              </div>
              <span className="catalog-result-count">{visibleSeeds.length} {visibleSeeds.length === 1 ? 'variety' : 'varieties'}</span>
            </div>

            {isLoading ? (
              <div className="catalog-state"><IonSpinner name="crescent" /><span>Loading seed availability…</span></div>
            ) : loadError ? (
              <div className="catalog-state catalog-error" role="alert">{loadError}</div>
            ) : visibleSeeds.length ? (
              <div className="seed-grid">
                {visibleSeeds.map((seed, index) => (
                  <button className={`seed-card seed-card-${seed.category.toLowerCase()}`} key={`${seed.name}-${seed.category}`} type="button" onClick={() => setSelectedSeed(seed)} aria-label={`Tingnan ang gabay sa pagtatanim ng ${seed.name}`}>
                    {seed.imageUrl && <img className="seed-card-image" src={seed.imageUrl} alt={`${seed.name} seeds`} loading="lazy" />}
                    <div className="seed-card-topline"><span>{seed.category}</span><span className={seed.stock > 0 ? 'seed-availability' : 'seed-availability is-empty'}>{seed.stock > 0 ? 'Available' : 'Out of stock'}</span></div>
                    <h3>{seed.name}</h3>
                    <div className="seed-card-bottom">
                      <div className="seed-stock"><strong>{seed.stock.toLocaleString()}</strong><span>bags available</span></div>
                      <div className="seed-locations"><IonIcon icon={locationOutline} /><span>{seed.locations.length ? seed.locations.slice(0, 2).join(' / ') : 'Location on request'}{seed.locations.length > 2 ? ` +${seed.locations.length - 2} more` : ''}</span></div>
                    </div>
                    {!seed.imageUrl && <span className="seed-card-number">{String(index + 1).padStart(2, '0')}</span>}
                    <span className="seed-card-cta">Tingnan ang gabay sa pagtatanim <IonIcon icon={arrowForwardOutline} /></span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="catalog-state"><span className="catalog-empty-mark"><IonIcon icon={leafOutline} /></span><strong>No matching seeds</strong><span>Try another search or category.</span></div>
            )}
          </section>

          <section className="catalog-join">
            <div><p className="catalog-eyebrow">FOR FARMERS & COOPERATIVES</p><h2>Ready to plan your next planting?</h2></div>
            <p>Create an account to request seed allocations and follow deliveries from your local agriculture office.</p>
          </section>

          {selectedSeed && (() => {
            const guide = getCropGuide(selectedSeed);
            return (
              <div className="seed-detail-backdrop" role="presentation" onClick={() => setSelectedSeed(null)}>
                <section className="seed-detail-panel" role="dialog" aria-modal="true" aria-labelledby="seed-detail-title" onClick={(event) => event.stopPropagation()}>
                  <button className="seed-detail-close" type="button" onClick={() => setSelectedSeed(null)} aria-label="Isara ang gabay sa binhi"><IonIcon icon={closeOutline} /></button>
                  <div className="seed-detail-intro">
                    {selectedSeed.imageUrl && <img src={selectedSeed.imageUrl} alt="" />}
                    <div><p className="catalog-eyebrow">GABAY SA PAGTATANIM · {selectedSeed.category.toUpperCase()}</p><h2 id="seed-detail-title">{selectedSeed.name}</h2><p>{selectedSeed.stock.toLocaleString()} bag ang kasalukuyang nakalista sa {selectedSeed.locations.length || 0} lokasyon{selectedSeed.locations.length === 1 ? '' : 's'} ng imbentaryo.</p></div>
                  </div>
                  <div className="seed-detail-grid">
                    <article><span className="seed-detail-label">Angkop na lupang taniman</span><p>{guide.suitability}</p></article>
                    <article><span className="seed-detail-label">Lupa at lugar</span><p>{guide.soil}</p></article>
                    <article><span className="seed-detail-label">Pataba</span><p>{guide.fertilizer}</p></article>
                    <article><span className="seed-detail-label">Pamamahala sa peste</span><p>{guide.pestControl}</p></article>
                  </div>
                  <div className="seed-detail-locations">
                    <div><span className="seed-detail-label">Mga lokasyon sa katalogo</span><p>{selectedSeed.locations.length ? selectedSeed.locations.join(' · ') : 'Wala pang nakalistang lokasyon ng imbentaryo.'}</p></div>
                    <div><span className="seed-detail-label">Mga lugar na nag-request</span><p>{selectedSeed.requestedLocations.length ? selectedSeed.requestedLocations.join(' · ') : user ? 'Walang request na lugar para sa iyong access.' : 'Mag-sign in para makita ang mga protektadong request.'}</p></div>
                    <div><span className="seed-detail-label">Mga lugar na natanggap</span><p>{selectedSeed.deliveredLocations.length ? selectedSeed.deliveredLocations.join(' · ') : user ? 'Wala pang nakatalang kumpletong delivery para sa iyong access.' : 'Mag-sign in para makita ang mga protektadong delivery.'}</p></div>
                  </div>
                  <p className="seed-detail-disclaimer">Ang gabay na ito ay tulong sa pagpaplano lamang. Kumpirmahin ang lokal na lupa, panahon, variety, at tagubilin sa label ng produkto sa Municipal Agriculture Office bago magtanim o gumamit ng inputs.</p>
                </section>
              </div>
            );
          })()}
        </main>

        <footer className="catalog-footer"><Link className="catalog-footer-brand" to="/">SeedLink</Link><span>Connecting seed supply to the people who grow our food.</span><small>ORIENTAL MINDORO · {new Date().getFullYear()}</small></footer>
      </IonContent>
    </IonPage>
  );
};

export default Landing;