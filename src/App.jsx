import { useEffect, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Popup,
  useMap,
  useMapEvents
} from 'react-leaflet'
import L from 'leaflet'
import { supabase } from './lib/supabase'
import 'leaflet/dist/leaflet.css'

const DEFAULT_LOCATION = {
  latitude: 19.0760,
  longitude: 72.8777,
  name: 'Mumbai'
}

function MapController({ location }) {
  const map = useMap()

  useEffect(() => {
    if (location) {
      map.flyTo(
        [location.latitude, location.longitude],
        7,
        { duration: 1.2 }
      )
    }
  }, [location, map])

  return null
}

function MapCenterTracker({ onCenterChange }) {
  const map = useMapEvents({
    moveend() {
      const center = map.getCenter()

      onCenterChange({
        latitude: center.lat,
        longitude: center.lng,
        name: 'Selected Map Location'
      })
    }
  })

  return null
}

function MapClickHandler({ onLocationSelect }) {
  useMapEvents({
    click(event) {
      onLocationSelect({
        latitude: event.latlng.lat,
        longitude: event.latlng.lng,
        name: 'Selected Map Location'
      })
    }
  })

  return null
}

function getRiskStyle(risk) {
  if (risk === 'Low') {
    return {
      color: '#22c55e',
      fillColor: '#22c55e'
    }
  }

  if (risk === 'Moderate') {
    return {
      color: '#f59e0b',
      fillColor: '#f59e0b'
    }
  }

  return {
    color: '#ef4444',
    fillColor: '#ef4444'
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371

  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function App() {
  const [pfzZones, setPfzZones] = useState([])
  const [riskData, setRiskData] = useState([])
  const [oceanData, setOceanData] = useState([])
  const [weatherData, setWeatherData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [userLocation, setUserLocation] = useState(null)
  const [mapLocation, setMapLocation] = useState(DEFAULT_LOCATION)
  const [selectedLocation, setSelectedLocation] = useState(DEFAULT_LOCATION)
  const [nearestPfz, setNearestPfz] = useState(null)
  const [query, setQuery] = useState('')
  const [showEvidence, setShowEvidence] = useState(false)

  useEffect(() => {
    loadMarineData()
  }, [])

  async function loadMarineData() {
    setLoading(true)
    setError('')

    const { data: pfz, error: pfzError } = await supabase
      .from('pfz_zones')
      .select('*')
      .order('id')

    if (pfzError) {
      setError(`PFZ loading error: ${pfzError.message}`)
      setLoading(false)
      return
    }

    const { data: risks, error: riskError } = await supabase
      .from('risk_assessments')
      .select('*')

    if (riskError) {
      setError(`Risk loading error: ${riskError.message}`)
      setLoading(false)
      return
    }

    const { data: ocean, error: oceanError } = await supabase
      .from('ocean_observations')
      .select('*')
      .order('id')

    if (oceanError) {
      setError(`Ocean loading error: ${oceanError.message}`)
      setLoading(false)
      return
    }

    const { data: weather, error: weatherError } = await supabase
      .from('weather_observations')
      .select('*')
      .order('id')

    if (weatherError) {
      setError(`Weather loading error: ${weatherError.message}`)
      setLoading(false)
      return
    }

    setPfzZones(pfz || [])
    setRiskData(risks || [])
    setOceanData(ocean || [])
    setWeatherData(weather || [])
    setLoading(false)
  }

  function getRiskForPfz(pfzId) {
    return riskData.find((risk) => risk.pfz_id === pfzId)
  }


  function getNearestObservation(observations, latitude, longitude) {
  if (!observations.length) return null

  let nearest = null
  let shortestDistance = Infinity

  for (const observation of observations) {
    const distance = calculateDistance(
      latitude,
      longitude,
      observation.latitude,
      observation.longitude
    )

    if (distance < shortestDistance) {
      shortestDistance = distance
      nearest = {
        ...observation,
        distance
      }
    }
  }

  return nearest
}
  function findNearestPfz(location = userLocation) {
    if (
  !pfzZones.length ||
  !oceanData.length ||
  !weatherData.length
) {
  return
}

    let nearest = null
    let shortestDistance = Infinity

    for (const pfz of pfzZones) {
      const distance = calculateDistance(
        location.latitude,
        location.longitude,
        pfz.latitude,
        pfz.longitude
      )

      if (distance < shortestDistance) {
        shortestDistance = distance
        const ocean = getNearestObservation(
          oceanData,
          pfz.latitude,
          pfz.longitude
        )

        const weather = getNearestObservation(
          weatherData,
          pfz.latitude,
          pfz.longitude
        )

        nearest = {
          ...pfz,
          distance,
          risk: getRiskForPfz(pfz.id),
          ocean,
          weather
        }
      }
    }

    setNearestPfz(nearest)
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          name: 'Your Location'
        }

        setUserLocation(location)
        setMapLocation(location)
        setSelectedLocation(location)
        findNearestPfz(location)
      },
      () => {
        setError(
          'Location permission was not available. Using Mumbai demo location.'
        )
        setUserLocation(DEFAULT_LOCATION)
        setMapLocation(DEFAULT_LOCATION)
        setSelectedLocation(DEFAULT_LOCATION)
        findNearestPfz(DEFAULT_LOCATION)
      }
    )
  }

function selectMapLocation(location) {
  setSelectedLocation(location)
  setMapLocation(location)
  findNearestPfz(location)
}

function runQuery() {
  if (!query.trim()) return

  const text = query.toLowerCase()

  if (
    text.includes('nearest') ||
    text.includes('closest') ||
    text.includes('pfz')
  ) {
    findNearestPfz(mapLocation)
  }
}

  return (
    <div style={styles.app}>

      {/* HEADER */}
      <header style={styles.header}>
        <div>
          <div style={styles.logo}>ORCA</div>
          <div style={styles.subtitle}>
            Marine AI Copilot
          </div>
        </div>

        <div style={styles.headerStatus}>
          <span style={styles.statusDot}></span>
          Prototype Intelligence System
        </div>
      </header>


      {/* MAIN */}
      <main style={styles.main}>

        {/* LEFT / CHAT PANEL */}
        <section style={styles.leftPanel}>

          <div style={styles.panelTitle}>
            Marine Intelligence
          </div>

          <div style={styles.queryBox}>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask ORCA something about the marine environment..."
              style={styles.textarea}
            />

            <button
              onClick={runQuery}
              style={styles.primaryButton}
            >
              Ask ORCA
            </button>
          </div>


          <div style={styles.exampleBox}>
            <div style={styles.exampleTitle}>
              Try the demo
            </div>

            <button
              style={styles.exampleButton}
              onClick={() => {
                const demoQuery =
                  'Find the nearest Potential Fishing Zone and tell me whether it is safe to go there.'

                setQuery(demoQuery)
                findNearestPfz(mapLocation)
              }}
            >
              Find nearest PFZ & assess safety
            </button>
          </div>


          <button
            onClick={useMyLocation}
            style={styles.locationButton}
          >
            📍 Use My Location
          </button>


          {/* RESULT */}
          {nearestPfz && (
            <div style={styles.resultCard}>

              <div style={styles.resultHeader}>
                <span>Nearest PFZ</span>
                <span style={styles.confidence}>
                  {Math.round(nearestPfz.confidence * 100)}% confidence
                </span>
              </div>

              <h2 style={styles.pfzName}>
                {nearestPfz.zone_name}
              </h2>

              <div style={styles.distance}>
                {nearestPfz.distance.toFixed(1)} km away
              </div>

              <div style={styles.infoGrid}>

                <div>
                  <span style={styles.label}>Potential</span>
                  <strong>{nearestPfz.potential_level}</strong>
                </div>

                <div>
                  <span style={styles.label}>Risk</span>
                  <strong>
                    {nearestPfz.risk?.overall_risk || 'Unknown'}
                  </strong>
                </div>

                <div>
                  <span style={styles.label}>Risk Score</span>
                  <strong>
                    {nearestPfz.risk?.risk_score ?? '—'}
                  </strong>
                </div>

              </div>


              <div style={styles.intelligenceSection}>

  <div style={styles.sectionHeading}>
    🌊 Ocean Conditions
  </div>

  <div style={styles.dataGrid}>

    <div style={styles.dataCard}>
      <span style={styles.label}>Sea Temperature</span>
      <strong>
        {nearestPfz.ocean?.sea_surface_temperature ?? '—'} °C
      </strong>
    </div>

    <div style={styles.dataCard}>
      <span style={styles.label}>Chlorophyll</span>
      <strong>
        {nearestPfz.ocean?.chlorophyll ?? '—'} mg/m³
      </strong>
    </div>

    <div style={styles.dataCard}>
      <span style={styles.label}>Wave Height</span>
      <strong>
        {nearestPfz.ocean?.wave_height ?? '—'} m
      </strong>
    </div>

    <div style={styles.dataCard}>
      <span style={styles.label}>Current Speed</span>
      <strong>
        {nearestPfz.ocean?.current_speed ?? '—'} m/s
      </strong>
    </div>

  </div>

</div>


<div style={styles.intelligenceSection}>

  <div style={styles.sectionHeading}>
    ☁️ Weather Conditions
  </div>

  <div style={styles.dataGrid}>

    <div style={styles.dataCard}>
      <span style={styles.label}>Wind Speed</span>
      <strong>
        {nearestPfz.weather?.wind_speed ?? '—'} km/h
      </strong>
    </div>

    <div style={styles.dataCard}>
      <span style={styles.label}>Visibility</span>
      <strong>
        {nearestPfz.weather?.visibility_km ?? '—'} km
      </strong>
    </div>

    <div style={styles.dataCard}>
      <span style={styles.label}>Rain Probability</span>
      <strong>
        {nearestPfz.weather?.rainfall_probability ?? '—'}%
      </strong>
    </div>

    <div style={styles.dataCard}>
      <span style={styles.label}>Condition</span>
      <strong>
        {nearestPfz.weather?.weather_condition ?? '—'}
      </strong>
    </div>

  </div>

</div>

              <div style={styles.recommendation}>
                <div style={styles.label}>
                  Recommendation
                </div>

                <div>
                  {nearestPfz.risk?.recommendation ||
                    'No assessment available.'}
                </div>
              </div>

              <div style={styles.reasoning}>
                <div style={styles.label}>
                  Why?
                </div>

                <div>
                  {nearestPfz.risk?.reasoning ||
                    'No reasoning available.'}
                </div>
              </div>
                      <button
  onClick={() => setShowEvidence(!showEvidence)}
  style={styles.evidenceButton}
>
  {showEvidence
    ? 'Hide recommendation evidence'
    : '🔎 Why this recommendation?'}
</button>

{showEvidence && (
  <div style={styles.evidencePanel}>

    <div style={styles.evidenceTitle}>
      RECOMMENDATION TRACE
    </div>

    <div style={styles.traceSection}>
      <div style={styles.traceHeading}>
        Fishing Suitability
      </div>

      <div style={styles.traceRow}>
        <span>PFZ Advisory</span>
        <span style={styles.successMark}>✓</span>
      </div>

      <div style={styles.traceRow}>
        <span>Sea Surface Temperature</span>
        <span style={styles.successMark}>
          {nearestPfz.ocean?.sea_surface_temperature != null
            ? '✓'
            : '—'}
        </span>
      </div>

      <div style={styles.traceRow}>
        <span>Chlorophyll</span>
        <span style={styles.successMark}>
          {nearestPfz.ocean?.chlorophyll != null
            ? '✓'
            : '—'}
        </span>
      </div>
    </div>


    <div style={styles.traceSection}>

      <div style={styles.traceHeading}>
        Safety Assessment
      </div>

      <div style={styles.traceRow}>
        <span>Wave Height</span>
        <span style={styles.successMark}>
          {nearestPfz.ocean?.wave_height != null
            ? '✓'
            : '—'}
        </span>
      </div>

      <div style={styles.traceRow}>
        <span>Wind</span>
        <span style={styles.successMark}>
          {nearestPfz.weather?.wind_speed != null
            ? '✓'
            : '—'}
        </span>
      </div>

      <div style={styles.traceRow}>
        <span>Weather</span>
        <span style={styles.successMark}>
          {nearestPfz.weather?.weather_condition
            ? '✓'
            : '—'}
        </span>
      </div>

      <div style={styles.traceRow}>
        <span>Risk Assessment</span>
        <span style={styles.successMark}>
          {nearestPfz.risk
            ? '✓'
            : '—'}
        </span>
      </div>

    </div>


    <div style={styles.evidenceValues}>

      <div style={styles.evidenceValueTitle}>
        Observed Values
      </div>

      <div>
        <span>SST</span>
        <strong>
          {nearestPfz.ocean?.sea_surface_temperature ?? '—'} °C
        </strong>
      </div>

      <div>
        <span>Chlorophyll</span>
        <strong>
          {nearestPfz.ocean?.chlorophyll ?? '—'} mg/m³
        </strong>
      </div>

      <div>
        <span>Wave</span>
        <strong>
          {nearestPfz.ocean?.wave_height ?? '—'} m
        </strong>
      </div>

      <div>
        <span>Wind</span>
        <strong>
          {nearestPfz.weather?.wind_speed ?? '—'} km/h
        </strong>
      </div>

      <div>
        <span>Rain Probability</span>
        <strong>
          {nearestPfz.weather?.rainfall_probability ?? '—'}%
        </strong>
      </div>

      <div>
        <span>Visibility</span>
        <strong>
          {nearestPfz.weather?.visibility_km ?? '—'} km
        </strong>
      </div>

    </div>


    <div style={styles.finalDecision}>

      <div style={styles.traceHeading}>
        FINAL DECISION
      </div>

      <div style={styles.finalRisk}>
        {nearestPfz.risk?.overall_risk || 'UNKNOWN'}
      </div>

      <div style={styles.finalRecommendation}>
        {nearestPfz.risk?.recommendation ||
          'No recommendation available.'}
      </div>

    </div>


    <div style={styles.sourceBox}>

      <div style={styles.evidenceValueTitle}>
        Data Sources
      </div>

      <div>
        Ocean:
        {' '}
        {nearestPfz.ocean?.source || 'Supabase Ocean Dataset'}
      </div>

      <div>
        Ocean observation:
        {' '}
        {nearestPfz.ocean?.observed_at
          ? new Date(
              nearestPfz.ocean.observed_at
            ).toLocaleString()
          : 'Timestamp unavailable'}
      </div>

      <div>
        Weather:
        {' '}
        {nearestPfz.weather?.source ||
          'Supabase Weather Dataset'}
      </div>

      <div>
        Weather observation:
        {' '}
        {nearestPfz.weather?.observed_at
          ? new Date(
              nearestPfz.weather.observed_at
            ).toLocaleString()
          : 'Timestamp unavailable'}
      </div>

    </div>

  </div>
)}
              <div style={styles.demoNotice}>
                ⚠ Prototype dataset — not a live marine safety advisory.
              </div>

            </div>
          )}

        </section>


        {/* MAP */}
        <section style={styles.mapSection}>

          {loading && (
            <div style={styles.loadingOverlay}>
              Loading marine intelligence...
            </div>
          )}

          {error && (
            <div style={styles.errorBanner}>
              {error}
            </div>
          )}

          <style>{`
            .orca-location-pin {
              background: transparent;
              border: 0;
            }
            .orca-pin {
              font-size: 36px;
              line-height: 40px;
              width: 40px;
              height: 40px;
              text-align: center;
              filter: drop-shadow(0 2px 2px rgba(0,0,0,0.35));
            }
          `}</style>

          <MapContainer
            center={[19.0, 73.5]}
            zoom={6}
            style={styles.map}
          >
             <MapClickHandler onLocationSelect={selectMapLocation} />

            <TileLayer
               attribution='&copy; OpenStreetMap contributors'
               url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* SELECTED SEARCH LOCATION: changes only when the user clicks the map
                or presses Use My Location. */}
            <Marker
              position={[
                selectedLocation.latitude,
                selectedLocation.longitude
              ]}
              icon={L.divIcon({
                className: 'orca-location-pin',
                html: '<div class=\"orca-pin\">📍</div>',
                iconSize: [40, 40],
                iconAnchor: [20, 40]
              })}
            >
              <Popup>
                <strong>{selectedLocation.name}</strong>
                <br />
                {selectedLocation.latitude.toFixed(4)}, {selectedLocation.longitude.toFixed(4)}
                <br />
                <small>Click anywhere on the map to search this location.</small>
              </Popup>
            </Marker>

            {/* REAL USER LOCATION: blue dot remains only after Use My Location. */}
            {userLocation && (
              <CircleMarker
                center={[userLocation.latitude, userLocation.longitude]}
                radius={7}
                pathOptions={{
                  color: '#2563eb',
                  fillColor: '#2563eb',
                  fillOpacity: 0.9
                }}
              >
                <Popup>
                  <strong>Your Location</strong>
                  <br />
                  {userLocation.latitude.toFixed(4)}, {userLocation.longitude.toFixed(4)}
                </Popup>
              </CircleMarker>
            )}

            {/* PFZ MARKERS */}
            {pfzZones.map((pfz) => {

              const risk = getRiskForPfz(pfz.id)
              const riskStyle = getRiskStyle(
                risk?.overall_risk
              )

              return (
                <CircleMarker
                  key={pfz.id}
                  center={[
                    pfz.latitude,
                    pfz.longitude
                  ]}
                  radius={14}
                  pathOptions={{
                    ...riskStyle,
                    fillOpacity: 0.65,
                    weight: 3
                  }}
                >

                  <Popup>

                    <strong>
                      {pfz.zone_name}
                    </strong>

                    <br />
                    Potential: {pfz.potential_level}

                    <br />
                    Confidence:
                    {' '}
                    {Math.round(pfz.confidence * 100)}%

                    <br />
                    Risk:
                    {' '}
                    {risk?.overall_risk || 'Unknown'}

                    <br />
                    Risk Score:
                    {' '}
                    {risk?.risk_score ?? '—'}

                    <br />
                    <br />

                    <small>
                      ORCA Prototype Dataset
                    </small>

                  </Popup>

                </CircleMarker>
              )
            })}

          </MapContainer>

        </section>


        {/* RIGHT PANEL */}
        <aside style={styles.rightPanel}>

          <div style={styles.panelTitle}>
            Marine Intelligence
          </div>

          <div style={styles.metricCard}>
            <span>PFZ Zones</span>
            <strong>{pfzZones.length}</strong>
          </div>

          <div style={styles.metricCard}>
            <span>Ocean Observations</span>
            <strong>{oceanData.length}</strong>
          </div>

          <div style={styles.metricCard}>
            <span>Weather Observations</span>
            <strong>{weatherData.length}</strong>
          </div>

          <div style={styles.metricCard}>
            <span>Risk Assessments</span>
            <strong>{riskData.length}</strong>
          </div>


          <div style={styles.legendTitle}>
            Risk Legend
          </div>

          <div style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: '#22c55e' }} />
            Low Risk
          </div>

          <div style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: '#f59e0b' }} />
            Moderate Risk
          </div>

          <div style={styles.legendItem}>
            <span style={{ ...styles.legendDot, background: '#ef4444' }} />
            High Risk
          </div>


          <div style={styles.agentBox}>

            <div style={styles.legendTitle}>
              Agent Trace
            </div>

            <div>✓ Planner Agent</div>
            <div>✓ PFZ Agent</div>
            <div>✓ Ocean Agent</div>
            <div>✓ Weather Agent</div>
            <div>✓ Risk Assessment Agent</div>
            <div>✓ GIS Agent</div>

          </div>

        </aside>

      </main>

    </div>
  )
}


const styles = {

  app: {
    minHeight: '100vh',
    background: '#07111f',
    color: '#e5eef8',
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  },

  header: {
    height: '72px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    background: '#0b1728',
    borderBottom: '1px solid #20334b'
  },

  logo: {
    fontSize: '26px',
    fontWeight: 800,
    letterSpacing: '3px'
  },

  subtitle: {
    fontSize: '12px',
    color: '#8da4bd',
    marginTop: '2px'
  },

  headerStatus: {
    fontSize: '13px',
    color: '#8da4bd',
    display: 'flex',
    gap: '8px',
    alignItems: 'center'
  },

  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#22c55e'
  },

  main: {
    display: 'grid',
    gridTemplateColumns: '320px 1fr 260px',
    height: 'calc(100vh - 72px)'
  },

  leftPanel: {
    padding: '20px',
    background: '#0b1728',
    borderRight: '1px solid #20334b',
    overflowY: 'auto'
  },

  rightPanel: {
    padding: '20px',
    background: '#0b1728',
    borderLeft: '1px solid #20334b',
    overflowY: 'auto'
  },

  panelTitle: {
    fontSize: '17px',
    fontWeight: 700,
    marginBottom: '18px'
  },

  queryBox: {
    background: '#101f33',
    border: '1px solid #29415d',
    borderRadius: '12px',
    padding: '12px'
  },

  textarea: {
    width: '100%',
    minHeight: '110px',
    resize: 'vertical',
    boxSizing: 'border-box',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#e5eef8',
    fontSize: '14px',
    fontFamily: 'inherit'
  },

  primaryButton: {
    width: '100%',
    padding: '11px',
    border: 'none',
    borderRadius: '8px',
    background: '#1677ff',
    color: 'white',
    fontWeight: 700,
    cursor: 'pointer'
  },

  exampleBox: {
    marginTop: '16px'
  },

  exampleTitle: {
    fontSize: '12px',
    color: '#8da4bd',
    marginBottom: '8px'
  },

  exampleButton: {
    width: '100%',
    textAlign: 'left',
    padding: '11px',
    borderRadius: '8px',
    border: '1px solid #29415d',
    background: '#101f33',
    color: '#cfe0f2',
    cursor: 'pointer'
  },

  locationButton: {
    width: '100%',
    marginTop: '12px',
    padding: '10px',
    borderRadius: '8px',
    border: '1px solid #315170',
    background: '#102b45',
    color: '#bcd8f0',
    cursor: 'pointer'
  },

  mapSection: {
    position: 'relative',
    minWidth: 0
  },

  map: {
    width: '100%',
    height: '100%'
  },

  loadingOverlay: {
    position: 'absolute',
    zIndex: 1000,
    top: '15px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '9px 16px',
    background: '#0b1728',
    border: '1px solid #29415d',
    borderRadius: '8px',
    fontSize: '13px'
  },

  errorBanner: {
    position: 'absolute',
    zIndex: 1000,
    top: '15px',
    left: '15px',
    right: '15px',
    padding: '10px',
    background: '#451a1a',
    color: '#fecaca',
    borderRadius: '8px'
  },

  resultCard: {
    marginTop: '18px',
    padding: '15px',
    background: '#10243a',
    border: '1px solid #2b4b69',
    borderRadius: '12px'
  },

  resultHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: '#8da4bd'
  },

  confidence: {
    color: '#6ee7b7'
  },

  pfzName: {
    fontSize: '19px',
    margin: '10px 0 3px'
  },

  distance: {
    color: '#7fb5e8',
    fontSize: '13px'
  },

  infoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '8px',
    marginTop: '15px'
  },

  intelligenceSection: {
  marginTop: '16px',
  paddingTop: '13px',
  borderTop: '1px solid #29415d'
},

sectionHeading: {
  fontSize: '13px',
  fontWeight: 700,
  marginBottom: '10px',
  color: '#cfe0f2'
},

dataGrid: {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '8px'
},

evidenceButton: {
  width: '100%',
  marginTop: '14px',
  padding: '10px',
  borderRadius: '8px',
  border: '1px solid #3b82f6',
  background: '#102b45',
  color: '#93c5fd',
  fontWeight: 700,
  cursor: 'pointer'
},

evidencePanel: {
  marginTop: '12px',
  padding: '13px',
  background: '#091827',
  border: '1px solid #315170',
  borderRadius: '10px'
},

evidenceTitle: {
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '1px',
  color: '#93c5fd',
  marginBottom: '14px'
},

traceSection: {
  paddingBottom: '12px',
  marginBottom: '12px',
  borderBottom: '1px solid #243c56'
},

traceHeading: {
  fontSize: '12px',
  fontWeight: 700,
  color: '#d7e6f5',
  marginBottom: '8px'
},

traceRow: {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '11px',
  color: '#9db1c7',
  padding: '5px 0'
},

successMark: {
  color: '#4ade80',
  fontWeight: 800
},

evidenceValues: {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: '7px',
  marginTop: '12px'
},

evidenceValueTitle: {
  gridColumn: '1 / -1',
  fontSize: '11px',
  fontWeight: 700,
  color: '#8da4bd',
  marginBottom: '2px'
},

finalDecision: {
  marginTop: '14px',
  padding: '12px',
  textAlign: 'center',
  background: '#10243a',
  border: '1px solid #315170',
  borderRadius: '8px'
},

finalRisk: {
  fontSize: '20px',
  fontWeight: 800,
  marginTop: '5px'
},

finalRecommendation: {
  marginTop: '5px',
  fontSize: '11px',
  color: '#aabdd1',
  lineHeight: 1.4
},

sourceBox: {
  marginTop: '13px',
  paddingTop: '10px',
  borderTop: '1px solid #243c56',
  fontSize: '10px',
  color: '#7189a3',
  lineHeight: 1.7
},

dataCard: {
  padding: '9px',
  background: '#0b1b2e',
  border: '1px solid #243c56',
  borderRadius: '8px',
  fontSize: '12px'
},

  label: {
    display: 'block',
    fontSize: '11px',
    color: '#7f97b0',
    marginBottom: '4px'
  },

  recommendation: {
    marginTop: '15px',
    paddingTop: '12px',
    borderTop: '1px solid #29415d',
    fontSize: '13px',
    lineHeight: 1.5
  },

  reasoning: {
    marginTop: '12px',
    fontSize: '13px',
    lineHeight: 1.5
  },

  demoNotice: {
    marginTop: '14px',
    fontSize: '10px',
    color: '#fbbf24',
    lineHeight: 1.4
  },

  metricCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '13px',
    marginBottom: '9px',
    background: '#101f33',
    border: '1px solid #243c56',
    borderRadius: '9px',
    fontSize: '13px',
    color: '#9db1c7'
  },

  legendTitle: {
    marginTop: '22px',
    marginBottom: '12px',
    fontSize: '13px',
    fontWeight: 700
  },

  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    fontSize: '12px',
    marginBottom: '9px',
    color: '#aabdd1'
  },

  legendDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    display: 'inline-block'
  },

  agentBox: {
    marginTop: '25px',
    paddingTop: '15px',
    borderTop: '1px solid #243c56',
    fontSize: '12px',
    lineHeight: 1.9,
    color: '#8fc7a8'
  }
}

export default App