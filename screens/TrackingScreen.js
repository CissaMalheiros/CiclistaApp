import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import styles from '../styles/styles.js';
import { addRota } from '../database';
import { formatTime } from '../utils/format';

async function pedirPermissoes() {
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') {
    alert('Permissão de localização negada!');
    return false;
  }
  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
  if (bgStatus !== 'granted') {
    alert('Permissão de localização em segundo plano negada!');
    return false;
  }
  return true;
}

function getLeafletHtml(location, routeCoords) {
  // Gera o HTML do mapa Leaflet com OSM, marcador e rota
  const lat = location ? location.coords.latitude : -23.5505;
  const lng = location ? location.coords.longitude : -46.6333;
  const polyline = routeCoords.length > 0
    ? `L.polyline([${routeCoords.map(loc => `[${loc.coords.latitude},${loc.coords.longitude}]`).join(',')}], {color: '#FF6B6B', weight: 4}).addTo(map);`
    : '';
  const marker = location
    ? `L.marker([${lat},${lng}]).addTo(map);`
    : '';
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name='viewport' content='width=device-width, initial-scale=1.0'>
      <link rel='stylesheet' href='https://unpkg.com/leaflet/dist/leaflet.css'/>
      <style>html, body, #map { height: 100%; margin: 0; padding: 0; }</style>
    </head>
    <body>
      <div id='map' style='width:100vw;height:100vh;'></div>
      <script src='https://unpkg.com/leaflet/dist/leaflet.js'></script>
      <script>
        var map = L.map('map').setView([${lat}, ${lng}], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(map);
        ${marker}
        ${polyline}
      </script>
    </body>
    </html>
  `;
}

export default function TrackingScreen({ route, navigation }) {
  const { routeType, userId } = route.params;
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [isTracking, setIsTracking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const timerRef = useRef(null);
  const locationSubscription = useRef(null);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permissão para acessar a localização foi negada');
        return;
      }
      const backgroundStatus = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus.status !== 'granted') {
        setErrorMsg('Permissão para localização em segundo plano foi negada');
        return;
      }
    })();
  }, []);

  useEffect(() => {
    if (isTracking && !isPaused) {
      Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1000,
          distanceInterval: 1,
        },
        (newLocation) => {
          setLocation(newLocation);
          setRouteCoords((prevRoute) => [...prevRoute, newLocation]);
        }
      ).then(subscription => {
        locationSubscription.current = subscription;
      });
    } else if (!isTracking || isPaused) {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    }
    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove();
        locationSubscription.current = null;
      }
    };
  }, [isTracking, isPaused]);

  useEffect(() => {
    if (isTracking && !isPaused) {
      timerRef.current = setInterval(() => {
        setSeconds((prevSeconds) => prevSeconds + 1);
      }, 1000);
    } else if (!isTracking || isPaused) {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isTracking, isPaused]);

  const startTracking = () => {
    setIsTracking(true);
    setIsPaused(false);
  };

  const pauseTracking = () => {
    setIsPaused(true);
  };

  const stopTracking = async () => {
    setIsTracking(false);
    setIsPaused(false);
    setShowSummary(true);
    await addRota(userId, routeType, routeCoords, formatTime(seconds));
  };

  const resetTracking = () => {
    setSeconds(0);
    setRouteCoords([]);
    setShowSummary(false);
  };

  let text = 'Aguardando...';
  if (errorMsg) {
    text = errorMsg;
  } else if (location) {
    text = `Latitude: ${location.coords.latitude.toFixed(6)}, Longitude: ${location.coords.longitude.toFixed(6)}`;
  }

  if (showSummary) {
    return (
      <View style={styles.container}>
        {location && (
          <WebView
            originWhitelist={['*']}
            source={{ html: getLeafletHtml(location, routeCoords) }}
            style={styles.map}
            javaScriptEnabled={true}
            domStorageEnabled={true}
          />
        )}
        <Text style={styles.summaryText}>Tipo de trajeto: {routeType}</Text>
        <Text style={styles.summaryText}>Tempo total: {formatTime(seconds)}</Text>
        <TouchableOpacity style={styles.summaryButton} onPress={resetTracking}>
          <Text style={styles.summaryButtonText}>Reiniciar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {location ? (
        <WebView
          originWhitelist={['*']}
          source={{ html: getLeafletHtml(location, routeCoords) }}
          style={styles.map}
          javaScriptEnabled={true}
          domStorageEnabled={true}
        />
      ) : (
        <View style={[styles.map, {alignItems:'center',justifyContent:'center'}]}>
          <Text>Inicie o trajeto...</Text>
        </View>
      )}
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>{text}</Text>
        <Text style={styles.timerText}>Tempo de percurso: {formatTime(seconds)}</Text>
      </View>
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, isTracking && !isPaused ? styles.buttonDisabled : null]}
          onPress={startTracking}
          disabled={isTracking && !isPaused}
        >
          <Text style={styles.buttonText}>Iniciar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, !isTracking || isPaused ? styles.buttonDisabled : null]}
          onPress={pauseTracking}
          disabled={!isTracking || isPaused}
        >
          <Text style={styles.buttonText}>Pausar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, !isTracking ? styles.buttonDisabled : null]}
          onPress={stopTracking}
          disabled={!isTracking}
        >
          <Text style={styles.buttonText}>Parar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}