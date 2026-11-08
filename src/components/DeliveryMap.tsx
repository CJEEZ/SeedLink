import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import { divIcon } from 'leaflet';
import { carOutline } from 'ionicons/icons';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useState } from 'react';
import { useMap } from 'react-leaflet';
import type { AllocationRequest } from '../data/seedlink';
import { findDepotCoordinate, findDestinationCoordinate, type DeliveryCoordinate } from './deliveryLocations';
import './DeliveryMap.css';

const DEFAULT_CENTER: DeliveryCoordinate = [13.0925, 121.0125];
const destinationIcon = divIcon({
  className: 'delivery-destination-marker-shell',
  html: '<span class="delivery-destination-marker" aria-hidden="true"></span>',
  iconSize: [28, 38],
  iconAnchor: [14, 38],
  popupAnchor: [0, -36],
});
const vehicleIcon = divIcon({
  className: 'delivery-vehicle-marker-shell',
  html: `<span class="delivery-vehicle-marker"><img src="${carOutline}" alt="" /></span>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -19],
});

const ROUTING_API = 'https://router.project-osrm.org/route/v1/driving';

interface RoadRouteResponse {
  code?: string;
  routes?: {
    distance: number;
    duration: number;
    geometry: {
      coordinates: [number, number][];
    };
  }[];
}

function FitRoute({ route }: { route: DeliveryCoordinate[] }) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(route, { padding: [28, 28], maxZoom: 12 });
  }, [map, route]);

  return null;
}

function useRoadRoute(points: DeliveryCoordinate[]) {
  const [roadRoute, setRoadRoute] = useState<DeliveryCoordinate[]>([]);
  const [routeSummary, setRouteSummary] = useState('');
  const [routeStatus, setRouteStatus] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const waypoints = useMemo(
    () => points.map(([latitude, longitude]) => `${longitude},${latitude}`).join(';'),
    [points],
  );

  useEffect(() => {
    const controller = new AbortController();
    setRoadRoute([]);
    setRouteStatus('loading');
    setRouteSummary('');
    if (!waypoints) {
      setRouteStatus('fallback');
      return () => controller.abort();
    }

    void fetch(`${ROUTING_API}/${waypoints}?overview=full&geometries=geojson&steps=false`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Routing service returned ${response.status}.`);
        return response.json() as Promise<RoadRouteResponse>;
      })
      .then((result) => {
        const route = result.routes?.[0];
        const coordinates = route?.geometry.coordinates;
        if (result.code !== 'Ok' || !route || !Array.isArray(coordinates) || coordinates.length < 2) {
          throw new Error('No drivable route was found.');
        }
        setRoadRoute(coordinates.map(([longitude, latitude]): DeliveryCoordinate => [latitude, longitude]));
        setRouteSummary(`${(route.distance / 1000).toFixed(1)} km · ${Math.max(1, Math.round(route.duration / 60))} min by road`);
        setRouteStatus('ready');
      })
      .catch((routeError: unknown) => {
        if (routeError instanceof Error && routeError.name === 'AbortError') return;
        setRouteStatus('fallback');
      });

    return () => controller.abort();
  }, [waypoints]);

  return { roadRoute, routeSummary, routeStatus };
}

interface DeliveryMapProps {
  request: AllocationRequest;
  compact?: boolean;
}

const DeliveryMap: React.FC<DeliveryMapProps> = ({ request, compact = false }) => {
  const depotName = request.depot || request.municipality;
  const depotPosition = useMemo(
    () => findDepotCoordinate(depotName) ?? DEFAULT_CENTER,
    [depotName],
  );
  const destinationPosition = useMemo(
    () => findDestinationCoordinate(request.municipality),
    [request.municipality],
  );
  const truckLatitude = request.latitude;
  const truckLongitude = request.longitude;
  const truckPosition: DeliveryCoordinate | null = typeof truckLatitude === 'number' && typeof truckLongitude === 'number'
    ? [truckLatitude, truckLongitude]
    : null;
  const fallbackDestination = destinationPosition ?? DEFAULT_CENTER;
  const route: DeliveryCoordinate[] = useMemo(
    () => typeof truckLatitude === 'number' && typeof truckLongitude === 'number'
      ? [depotPosition, [truckLatitude, truckLongitude], fallbackDestination]
      : [depotPosition, fallbackDestination],
    [depotPosition, fallbackDestination, truckLatitude, truckLongitude],
  );
  const { roadRoute, routeSummary, routeStatus } = useRoadRoute(destinationPosition ? route : []);

  if (!destinationPosition) {
    return (
      <div className={`delivery-map-wrap${compact ? ' delivery-map-compact' : ''}`}>
        <div className="delivery-map-heading">
          <div>
            <span className="delivery-map-kicker">DELIVERY DESTINATION</span>
            <strong>Location unavailable</strong>
          </div>
        </div>
        <p className="delivery-map-note">
          “{request.municipality}” is not a recognized Oriental Mindoro municipality. Update the order destination to a supported municipality to show its map.
        </p>
      </div>
    );
  }

  return (
    <div className={`delivery-map-wrap${compact ? ' delivery-map-compact' : ''}`}>
      <div className="delivery-map-heading">
        <div>
          <span className="delivery-map-kicker">LIVE DELIVERY MAP</span>
          <strong>{routeStatus === 'ready' ? routeSummary : truckPosition ? 'Truck location received' : 'Route prepared'}</strong>
        </div>
        <span className={truckPosition ? 'delivery-map-live' : 'delivery-map-waiting'}>
          {truckPosition ? 'Live GPS' : routeStatus === 'ready' ? 'Road route' : 'Awaiting GPS'}
        </span>
      </div>
      <div className="delivery-map-canvas">
        <MapContainer center={fallbackDestination} zoom={9} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitRoute route={roadRoute.length ? roadRoute : route} />
          <Polyline
            positions={roadRoute.length ? roadRoute : route}
            pathOptions={{ color: '#3e7654', weight: 4, dashArray: routeStatus === 'ready' ? undefined : '8 8' }}
          />
          <Marker position={truckPosition ?? depotPosition} icon={vehicleIcon} zIndexOffset={1000}>
            <Popup>
              {truckPosition
                ? `Truck ${request.truckId || 'in transit'}${request.lastLocationAt ? ` · Updated ${new Date(request.lastLocationAt).toLocaleTimeString()}` : ' · Live GPS'}`
                : `Truck ${request.truckId || ''} at dispatch depot · awaiting live GPS`}
            </Popup>
          </Marker>
          <Marker position={destinationPosition} icon={destinationIcon}>
            <Popup>Delivery destination: {request.municipality}</Popup>
          </Marker>
        </MapContainer>
      </div>
      <p className="delivery-map-note">
        {routeStatus === 'fallback'
          ? 'Road routing is unavailable right now; showing an approximate direct route.'
          : truckPosition
            ? 'Road route uses the latest reported truck GPS coordinates.'
            : 'A driver device must publish GPS coordinates to show the truck live.'}
        {' '}Routing by OSRM · map data © OpenStreetMap contributors.
      </p>
    </div>
  );
};

export default DeliveryMap;
