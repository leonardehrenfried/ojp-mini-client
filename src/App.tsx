import React, { useState, useEffect } from 'react';
import './App.css';

interface ConfigItem {
  id: string;
  label: string;
  placeholder: string;
}

const CONFIG: ConfigItem[] = [
  { id: 'originStopPlaceRef', label: 'Origin StopPlaceRef', placeholder: 'Enter Origin StopPlaceRef' },
  { id: 'destinationStopPlaceRef', label: 'Destination StopPlaceRef', placeholder: 'Enter Destination StopPlaceRef' },
  { id: 'depArrTime', label: 'Departure/Arrival Time', placeholder: 'e.g. 2023-06-22T12:00:00.000+02:00 (defaults to now)' },
];

const XML_TEMPLATE = (values: Record<string, string>, timestamp: string) => `
<OJP xmlns="http://www.vdv.de/ojp" xmlns:siri="http://www.siri.org.uk/siri" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="2.0" xsi:schemaLocation="http://www.vdv.de/ojp ../../OJP.xsd">
  <OJPRequest>
    <siri:ServiceRequest>
      <siri:RequestTimestamp>${timestamp}</siri:RequestTimestamp>
      <siri:RequestorRef>OpenTripPlanner</siri:RequestorRef>
      <siri:MessageIdentifier>abc</siri:MessageIdentifier>
      <OJPTripRequest>
        <siri:RequestTimestamp>${timestamp}</siri:RequestTimestamp>
        <Origin>
          <PlaceRef>
            <StopPlaceRef>${values.originStopPlaceRef || 'tampere:4091'}</StopPlaceRef>
            <Name>
              <Text>unused</Text>
            </Name>
          </PlaceRef>
          <DepArrTime>${values.depArrTime || timestamp}</DepArrTime>
        </Origin>
        <Destination>
          <PlaceRef>
            <StopPlaceRef>${values.destinationStopPlaceRef || 'U3xBPTFATz1IYW5ub3ZlciBIYXVwdGJhaG5ob2ZAWD05NzQxMDcxQFk9NTIzNzY0OTRAVT04NkBMPTEwMzU0ODUwQEI9MUBwPTE2ODY3MzE0MThAfEhhbm5vdmVyIEhhdXB0YmFobmhvZnw5Ljc0MTA3MXw1Mi4zNzY0OTR8ZmFsc2U-'}</StopPlaceRef>
            <Name>
              <Text>unused</Text>
            </Name>
          </PlaceRef>
        </Destination>
        <Params>
          <IncludeIntermediateStops>true</IncludeIntermediateStops>
        </Params>
      </OJPTripRequest>
    </siri:ServiceRequest>
  </OJPRequest>
</OJP>
`.trim();

function App() {
  const [formData, setFormData] = useState<Record<string, string>>(() => {
    const params = new URLSearchParams(window.location.search);
    const initialData: Record<string, string> = {};
    CONFIG.forEach(item => {
      const value = params.get(item.id);
      if (value) {
        initialData[item.id] = value;
      }
    });
    return initialData;
  });

  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(formData).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });
    const newRelativePathQuery = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState(null, '', newRelativePathQuery);
  }, [formData]);
  const getLocalISOString = (date: Date) => {
    const tzo = -date.getTimezoneOffset();
    const dif = tzo >= 0 ? '+' : '-';
    const pad = (num: number) => num.toString().padStart(2, '0');
    const msPad = (num: number) => num.toString().padStart(3, '0');
    return date.getFullYear() +
      '-' + pad(date.getMonth() + 1) +
      '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) +
      ':' + pad(date.getMinutes()) +
      ':' + pad(date.getSeconds()) +
      '.' + msPad(date.getMilliseconds()) +
      dif + pad(Math.floor(Math.abs(tzo) / 60)) +
      ':' + pad(Math.abs(tzo) % 60);
  };

  const [xmlDoc, setXmlDoc] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentTimestamp, setCurrentTimestamp] = useState(getLocalISOString(new Date()));

  useEffect(() => {
    setXmlDoc(XML_TEMPLATE(formData, currentTimestamp));
  }, [formData, currentTimestamp]);

  const handleInputChange = (id: string, value: string) => {
    setFormData((prev) => ({ ...prev, [id]: value }));
  };

  const formatXml = (xml: string) => {
    try {
      const PADDING = '  ';
      const reg = /(>)(<)(\/*)/g;
      let pad = 0;
      xml = xml.replace(reg, '$1\r\n$2$3');
      return xml.split('\r\n').map((node) => {
        let indent = 0;
        if (node.match(/.+<\/\w[^>]*>$/)) {
          indent = 0;
        } else if (node.match(/^<\/\w/)) {
          if (pad !== 0) pad -= 1;
        } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
          indent = 1;
        } else {
          indent = 0;
        }

        const padding = PADDING.repeat(pad);
        pad += indent;
        return padding + node;
      }).join('\r\n');
    } catch (e) {
      return xml;
    }
  };

  const handleSend = async () => {
    setLoading(true);
    setResponse(null);
    const now = getLocalISOString(new Date());
    setCurrentTimestamp(now);
    const currentXml = XML_TEMPLATE(formData, now);
    try {
      const res = await fetch('http://localhost:8080/otp/ojp/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
        },
        body: currentXml,
      });
      const data = await res.text();
      setResponse(formatXml(data));
    } catch (error) {
      setResponse(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container">
      <div className="app-container">
        <section className="left-pane">
        <h2><code>TripRequest</code> parameters</h2>
        {CONFIG.map((item) => (
          <div key={item.id}>
            <label htmlFor={item.id}>
              {item.label}
              <input
                type="text"
                id={item.id}
                placeholder={item.placeholder}
                value={formData[item.id] || ''}
                onChange={(e) => handleInputChange(item.id, e.target.value)}
              />
            </label>
          </div>
        ))}
        
        <button onClick={handleSend} aria-busy={loading} disabled={loading}>
          {loading ? 'Sending...' : 'Send XML'}
        </button>

        <article className="xml-preview">
          <header>Request preview</header>
          <pre><code>{xmlDoc}</code></pre>
        </article>
      </section>
      
      <section className="right-pane">
        <h2>Response</h2>
        {response ? (
          <pre><code>{response}</code></pre>
        ) : (
          <p>No response yet. Fill the form and click "Send".</p>
        )}
      </section>
      </div>
    </main>
  );
}

export default App;
