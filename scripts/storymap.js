$(window).on('load', function() {

  var documentSettings = {};

  // var lazyLoadInstance = new LazyLoad({
  //   //container: document.querySelector(".scrollingPanel"),
  //   container: document.getElementById("contents"),
  //   //container: document.querySelector("#contents"),
  //   use_native: true,
  // });

  // Some constants, such as default settings
  const MAX_ZOOM = 16;

  // Get preferences from query string
  const queryString = window.location.search;
  const urlParams = new URLSearchParams(queryString);

  // Force retina display with ?retina=true, otherwise default to false
  const DETECT_RETINA = urlParams.has('retina') ? urlParams.get('retina') : false;

  // Get CSV inputs and use to execute initMap function
  $.get('csv/Options.csv', function(options) {
    $.get('csv/Chapters.csv', function(chapters) {
      $.get('csv/Galleries.csv', function(galleries) {
        $.get('csv/Birds.csv', function(birds) {
          initMap(
            $.csv.toObjects(options),
            $.csv.toObjects(chapters),
            $.csv.toObjects(galleries),
            $.csv.toObjects(birds),
        )
        //lazyLoadInstance.update();
      })
    })
  })
});

  /**
  * Reformulates documentSettings as a dictionary, e.g.
  * {"webpageTitle": "Leaflet Boilerplate", "infoPopupText": "Stuff"}
  */
  function createDocumentSettings(settings) {
    for (var i in settings) {
      var setting = settings[i];
      documentSettings[setting.Setting] = setting.Customize;
    }
  }

  /**
   * Returns the value of a setting s
   * getSetting(s) is equivalent to documentSettings[constants.s]
   */
  function getSetting(s) {
    return documentSettings[constants[s]];
  }

  /**
   * Returns the value of setting named s from constants.js
   * or def if setting is either not set or does not exist
   * Both arguments are strings
   * e.g. trySetting('_authorName', 'No Author')
   */
  function trySetting(s, def) {
    s = getSetting(s);
    if (!s || s.trim() === '') { return def; }
    return s;
  }

  /**
   * Loads the basemap and adds it to the map
   */
  function addBaseMap() {
    // ESRI basemap for global/regional scale
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '© Esri',
      minZoom: 0,
      maxZoom: 11, 
      transparency: true, 
      opacity: 0.5,
      detectRetina: DETECT_RETINA,
    }).addTo(map);
     // NAIP imagery for finer detail
    L.tileLayer('https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}', {
      attribution: '© USGS',
      minZoom: DETECT_RETINA ? (L.Browser.retina ? 11 : 12) : 12,
      maxZoom: 20,
      maxNativeZoom: DETECT_RETINA ? (L.Browser.retina ? 15 : 16) : 16, 
      transparency: true, 
      opacity: 0.6,
      detectRetina: DETECT_RETINA,
    }).addTo(map);

  }

  /** Loads label tiles and adds them to the map */
  function addLabelOverlay() {

    map.createPane('labelPane');
    map.getPane('labelPane').style.zIndex = 401;
    // future edit: all types of items to different panes, to facilitate stacking
    map.getPane('labelPane').style.pointerEvents = 'none';

    stamenLinesUrlBase = 'https://stamen-tiles-{s}.a.ssl.fastly.net/terrain-lines/{z}/{x}/{y}';
    stamenLinesUrlSuffix = DETECT_RETINA ? (L.Browser.retina ? '@2x.png' : '.png') : '.png';
    var stamenLines = L.tileLayer(stamenLinesUrlBase + stamenLinesUrlSuffix, {
      attribution: '© OpenStreetMap, © Stamen',
      subdomains: 'abcd',
      ext: 'png',
      pane: 'labelPane',
      opacity: 0.5,
    });
    stamenLines.addTo(map);
    positronUrlBase = 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}';
    positronUrlSuffix = DETECT_RETINA ? (L.Browser.retina ? '@2x.png' : '.png') : '.png';
    var positronLabels = L.tileLayer(positronUrlBase + positronUrlSuffix, {
      attribution: '© CartoDB',
      pane: 'labelPane',
      opacity: 0.75,
    });
    positronLabels.addTo(map);

    // also create a pane for overlays that need to go on top of labels
    // fmi https://leafletjs.com/reference.html#map-pane
    map.createPane('topTilePane');
    map.getPane('topTilePane').style.zIndex = 402;
    map.createPane('topOverlayPane');
    map.getPane('topOverlayPane').style.zIndex = 403;
  }
  
  function initMap(options, chapters, galleries, birds) { 

    createDocumentSettings(options);

    var chapterContainerMargin = 20; // this needs to match .chapter-container top+bottom margin in CSS

    var paused = false;

    document.title = getSetting('_mapTitle');
    $('#header').append('<h1>' + (getSetting('_mapTitle') || '') + '</h1>');
    $('#header').append('<p class="map-subtitle">' + (getSetting('_mapSubtitle') || '') + '</p>');

    // Add logo
    if (getSetting('_mapLogo')) {
      $('#logo').append('<img src="' + getSetting('_mapLogo') + '" />');
      /*$('#top').css('height', '60px');*/
    } else {
      $('#logo').css('display', 'none');
      /*$('#header').css('padding-top', '25px');*/
    }
    // Click logo to go back to top
    // $('#logo').click(function() {
    //   $('#contents').animate({
    //     scrollTop: 0
    //   }, 0) // getDuration(0, '#contents', 0.5))
    //  });

    // Load tiles
    addBaseMap();
    addLabelOverlay();

    // add empty LayerGroup to contain any geojson overlays
    var jsonLayers = L.layerGroup([]);
    jsonLayers.addTo(map);

    // Add scale
    L.control.scale({
      position: 'topright',
      maxWidth: 200,
      imperial: true,
      metric: false,
    }).addTo(map);

    // Add zoom controls
    L.control.zoom({
      position: 'topright',
    }).addTo(map);

    // Initiate the zoom variable
    // var z = parseInt(map.getZoom());

    // Set up behavior of zoom buttons
    // $('#button-zoom-in').click(function(){
    //   z = parseInt(z) + 1;
    //   map.setZoom(z);
    // });
    // $('#button-zoom-out').click(function(){
    //   z = parseInt(z) - 1;
    //   map.setZoom(z);
    // });

    var markers = [];

    var markActiveColor = function(k) {
      for (var i = 0; i < markers.length; i++) {
        if (markers[i] && markers[i]._icon) {

          /* Removes marker-active class from all markers */
          markers[i]._icon.className = markers[i]._icon.className.replace(' marker-active', '');

          /* Adds marker-active class, which is orange, to marker k */
          if (i == k) {
            markers[k]._icon.className += ' marker-active';
          }

        }
      }
    }

    var pixelsAbove = [];
    var chapterCount = 0;
    var numberedMarkerCount = 0;

    var currentlyInFocus; // integer to specify each chapter is currently in focus
    var overlay;  // URL of the overlay for in-focus chapter
    var geoJsonOverlay;
    var geoJsonOverlay2;

    var headingList = [];

    // propagate chapters: if each chapter doesn't have a heading, use the last non-null heading
    for (i in chapters) {
      var headingIndex = parseInt(i);
      while ((!chapters[i]['Section']) & (headingIndex >= 0)) {
        chapters[i]['Section'] = chapters[headingIndex]['Chapter'];
        chapters[i]['SectionIndex'] = headingIndex;
        headingIndex += -1;
      }
    }

    // get galleries accessor, e.g. g['clinton'] for clinton gallery
    g = groupArrayOfObjects(galleries, "Gallery");

    // get bird taxon accessor, e.g. b['norsho'][0] for northern shoveler
    b = groupArrayOfObjects(birds, "Taxon ID");

    for (i in chapters) {
      var c = chapters[i];
      var cPrev = chapters[i-1];
      var cNext = chapters[i+1];

      if ( !isNaN(parseFloat(c['Latitude'])) && !isNaN(parseFloat(c['Longitude']))) {
        var lat = parseFloat(c['Latitude']);
        var lon = parseFloat(c['Longitude']);

        chapterCount += 1;

        if (c['Marker'] === 'Numbered') {
          numberedMarkerCount += 1
        }

        // var marker = L.marker([lat, lon], {
        //   icon: L.icon({
        //     iconUrl: 'markers/pin.svg',
        //     iconSize:     [36, 36], // size of the icon
        //     iconAnchor:   [18, 33], // point of the icon which will correspond to marker's location
        //   }),
        //   opacity: c['Marker'] === 'Hidden' ? 0 : 0.75,
        //   interactive: c['Marker'] === 'Hidden' ? false : true,
        // }

        var markerNumber = chapterCount;
        var markerNumber = numberedMarkerCount;

        var marker = L.marker([lat, lon], {
          icon: L.divIcon({
            className: "leaflet-marker-icon-div",
            iconSize:     [36, 36], // size of the icon
            iconAnchor:   [18, 33], // point of the icon which will correspond to marker's location
            html: c['Marker'] === 'Numbered' ? '<p>' + markerNumber + '</p>' : null,
            }),
          opacity: c['Marker'] === 'Hidden' ? 0 : 0.75,
          interactive: c['Marker'] === 'Hidden' ? false : true,
        });
        
        //if (c['Marker'] === 'Numbered') {
        //  marker.append(chapterCount);
        //}

        markers.push(marker);

      } else {
        markers.push(null);
      }

      // Add chapter container
      var container = $('<div></div>', {
        id: 'container' + i,
        class: 'chapter-container'
      });


      // Add media and credits: YouTube, audio, or image
      var media = null;
      var mediaContainer = null;

      // Add media source
      var source = '';
      if (c['Media Credit']) {
        source = $('<span>', {
          class: 'source'
        }).append(c['Media Credit'])
      }
      /*if (c['Media Credit Link']) {
        source = $('<a>', {
          text: c['Media Credit'],
          href: c['Media Credit Link'],
          target: "_blank",
          class: 'source'
        });
      } else {
        source = $('<span>', {
          text: c['Media Credit'],
          class: 'source'
        });
      }*/

      // YouTube or Google Drive video embed
      if (c['Media Link'] 
      && (c['Media Link'].indexOf('youtube.com/') > -1 | c['Media Link'].indexOf('drive.google.com/file/') > -1)
      ) {
        media = $('<iframe></iframe>', {
          src: c['Media Link'],
          width: '100%',
          height: '100%',
          frameborder: '0',
          allow: 'autoplay; encrypted-media',
          allowfullscreen: 'allowfullscreen',
        });

        mediaContainer = $('<div></div>', {
          class: 'img-container'
        }).append(media).after(source);
      }

      // Gallery in media link
      /*
      if (c['Media Link'] && c['Media Link'].substring(0, 1) == '[') {
        mediaContainer = $('<div></div>', {
          class: 'gallery-container'
        })

        var galleryItems = JSON.parse(c['Media Link']);
        
        for (i in galleryItems) {
          media = $('<img>', {
            src: galleryItems[i],
            alt: c['Chapter'],
            class: i == 0 ? 'gallery-first-item' : 'gallery-other-item',
          });  

          var enableLightbox = getSetting('_enableLightbox') === 'yes' ? true : false;
          if (enableLightbox) {
            var lightboxWrapper = $('<a></a>', {
              'data-lightbox': galleryItems,
              'href': galleryItems[i],
              // 'data-title': c['Chapter'],
              // 'data-alt': c['Chapter'],
            });
            media = lightboxWrapper.append(media);
          };
          
          mediaContainer.append(media);

        }

        mediaContainer.after(source);
      } */

      // Gallery v2
      if (c['Media Link'] && c['Media Link'].substring(0, 8) == 'gallery:') {
        mediaContainer = $('<div></div>', {
          class: 'gallery-container'
        })

        var galleryId = c['Media Link'].substring(8,);
        var galleryItems = g[galleryId];
        
        for (i in galleryItems) {
          media = $('<img>', {
            //'src': "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 11 14'%3E%3C/svg%3E",
            //'data-src': galleryItems[i]['Image'],
            'src': galleryItems[i]['Image'],
            'loading': 'lazy',
            'alt': galleryItems[i]['Caption'],
            'class': i == 0 ? 'gallery-first-item' : 'gallery-other-item',
          });  

          var enableLightbox = getSetting('_enableLightbox') === 'yes' ? true : false;
          if (enableLightbox) {
            var lightboxWrapper = $('<a></a>', {
              'data-lightbox': galleryId,
              'href': galleryItems[i]['Image'],
              'data-alt': galleryItems[i]['Caption'],
              'data-title': galleryItems[i]['Caption'],
            });
            media = lightboxWrapper.append(media);
          };
          
          mediaContainer.append(media);

        }

        mediaContainer.after(source);
      }


      // If not YouTube: either audio or image
      var mediaTypes = {
        'jpg': 'img',
        'jpeg': 'img',
        'png': 'img',
        'tiff': 'img',
        'gif': 'img',
        'mp3': 'audio',
        'ogg': 'audio',
        'wav': 'audio',
        'mp4': 'video',
      }

      var mediaExt = c['Media Link'] ? c['Media Link'].split('.').pop().toLowerCase() : '';
      var mediaType = mediaTypes[mediaExt];
      
      if (mediaType) {
        if (mediaType == 'img') {
          media = $('<img>', {
            'class': 'image',
            'src': c['Media Link'],
            'loading': 'lazy',
            'alt': c['Media Credit'],
            })
        var lightboxWrapper = $('<a></a>', {
          'data-lightbox': c['Media Link'],
          'href': c['Media Link'],
          'data-title': c['Media Credit'],
          'data-alt': c['Media Credit'],
        });
        media = lightboxWrapper.append(media);
      } else {
        media = $('<' + mediaType + '>', {
          src: c['Media Link'],
          controls: mediaType != 'img' ? 'controls' : '',
          autoplay: mediaType === 'video' ? 'autoplay' : '',
          muted: mediaType === 'video' ? 'muted' : '',
          alt: c['Chapter']
        });
      }
        mediaContainer = $('<div>', {
          class: mediaType + '-container'
        }).append(media).after(source);
    }

      if (c['Chapter']) {
        // container.append('<h2 class="chapter-header" id = "' + c['Chapter Slug'] + '">' + c['Chapter'] + '</h2>')
        // headingList.push([c['Chapter'], c['Chapter Slug']]);
        container.append('<h2 class="chapter-header">' + c['Chapter'] + '</h2>')
        headingList.push({'index': i, 'name': c['Chapter']});
      };
      container
        .append(media ? mediaContainer : '')
        .append(media ? source : '')
        .append($('<div class="description-wrapper">')
          .append('<div class="description-main">' + c['Description'] + '</div>')
          .append(c['Description 2'] ? '<div class="description-detail">' + c['Description 2'] + '</div>' : '')
        );

      $('#contents').append(container);

    }

    changeAttribution();

    /* Change image container heights */
    imgContainerHeight = parseInt(getSetting('_imgContainerHeight'));
    if (imgContainerHeight > 0) {
      $('.img-container').css({
        'height': imgContainerHeight + 'px',
        'max-height': imgContainerHeight + 'px',
      });
    }
    
    var scrollThreshold = 120 //80;

    // For each block (chapter), calculate how many pixels above it
    var titleHeight = $('div#title').outerHeight(true);
    var headerHeight = $('div#header').outerHeight(true);
    var navHeight = $('div#nav').outerHeight(true);
    pixelsAbove[0] = headerHeight + navHeight - scrollThreshold; // this controls how far down you have to scroll to trigger the next chapter
    for (i = 1; i < chapters.length; i++) {
      // pixelsAbove[i] = pixelsAbove[i-1] + $('div#container' + (i-1)).height() + chapterContainerMargin;
      // pixelsAbove[i] = pixelsAbove[i-1] + $('div#container' + (i)).outerHeight(true);
      pixelsAbove[i] = $('#container' + i).offset().top - titleHeight - navHeight - 200;  
      // change at 100 pixels from top of scroll area
    }
    pixelsAbove.push(Number.MAX_VALUE);

    var currentSection = '';

    // Execute whenever the map scrolls, or on initial load
    //$('div#contents').on('scrollend', updateMap);
    $('div#contents').scroll(updateMap);

    function updateMap(initial = false) {
      //var currentPosition = $(this).scrollTop();
      var currentPosition = $('div#contents').scrollTop();

      // Make title disappear on scroll (disabled)
      /*
      if (currentPosition < 200) {
        $('#title').css('opacity', 1 - Math.min(1, currentPosition / 100));
      }
      */
      
      // Make navbar fix to top on scroll
      if (currentPosition >= titleHeight + headerHeight) {
        $('#nav-bar').css('position', 'absolute').css('top',titleHeight);
        $('#back-to-top').css('visibility', 'visible');
      }
      if (currentPosition < titleHeight + headerHeight) {
        $('#nav-bar').css('position', 'static');
        $('#back-to-top').css('visibility', 'hidden');
      }
      
      // define what happens when we scroll
      for (var i = 0; i < pixelsAbove.length - 1; i++) {
        
        // execute the following if we have scrolled to a new section
        if ( (currentPosition >= pixelsAbove[i]
          && currentPosition < (pixelsAbove[i+1] - 2 * chapterContainerMargin)
          && currentlyInFocus != i) | initial
        ) {

          // Update URL hash
          location.hash = i + 1;

          // Remove styling for the old in-focus chapter and
          // add it to the new active chapter
          $('.chapter-container').removeClass("in-focus").addClass("out-focus");
          $('div#container' + i).addClass("in-focus").removeClass("out-focus");

          currentlyInFocus = i;
          markActiveColor(currentlyInFocus);

          var c = chapters[i];

          // if the section heading has changed
          if (c['Section'] != currentSection) {
            currentSection = c['Section'];
            document.title = getSetting('_mapTitle') + ': ' + c['Section'];
            /* style the nav buttons */
            $('[id^=nav-heading-item-]:not(#nav-heading-item-'+ c['SectionIndex'] + ')').removeClass('nav-heading-item-selected');
            $('#nav-heading-item-'+ c['SectionIndex']).addClass('nav-heading-item-selected');
            /* show only the marker pins in this section */
            for (var i = 0; i < markers.length; i++) {
              if (markers[i] && markers[i]._icon) {
                markers[i]._icon.className = markers[i]._icon.className.replace('marker-section-active', 'marker-section-inactive');
                if (markers[i]['Section'] == c['Section']) {
                  markers[i]._icon.className = markers[i]._icon.className.replace('marker-section-inactive', 'marker-section-active');
                }
              }
            }      
          } 

          var currentCenter = map.getCenter();
          var currentLat = currentCenter ? roundFloat(currentCenter.lat, 5) : null;
          var currentLon = currentCenter ? roundFloat(currentCenter.lng, 5) : null;
          var currentZoom = Math.round(map.getZoom());
          var newLat = parseFloat(c['Latitude']) ? roundFloat(parseFloat(c['Latitude']), 5) : null;
          var newLon = parseFloat(c['Longitude']) ? roundFloat(parseFloat(c['Longitude']), 5) : null;
          var newZoom = parseInt(c['Zoom']);
          
          // Fly to the new marker destination if latitude and longitude exist
          // and if latitude/longitude/zoom have changed
          // (moved this above the change in overlay for performance)
          if ((c['Latitude'] && c['Longitude'])
          //   & ((newLat != currentLat) | (newLon != currentLon) | (newZoom != currentZoom))
          // temporarily disabled this check as it was preventing zooming in some cases
          ) { 
            var zoom = c['Zoom'] ? parseInt(c['Zoom']) : z;
            map.flyTo([c['Latitude'], c['Longitude']], zoom, {
              animate: true,
              duration: 0.75, // default is 2 seconds
            });
            // z = zoom;
          }

          $('#non-map-content').hide();
          // show the correct non-map content if provided
          if (c['Non-Map Content']) {
            $('#non-map-content-inner').remove();
            $('#non-map-content').append('<div id="non-map-content-inner">' + c['Non-Map Content'] + '</div>');
            $('#non-map-content').show();
          }
          
          // Remove GeoJson overlay layer(s) existing
          jsonLayers.clearLayers();
          //if (map.hasLayer(geoJsonOverlay)) {
          //  map.removeLayer(geoJsonOverlay);
          //}
          //if (map.hasLayer(geoJsonOverlay2)) {
          //  map.removeLayer(geoJsonOverlay2);
          //}

          if (c['GeoJSON Overlay']) {
            $.getJSON(c['GeoJSON Overlay'], function(geojson) {

              // Parse properties string into a JS object
              var props = {};

              if (c['GeoJSON Feature Properties']) {
                var propsArray = c['GeoJSON Feature Properties'].split(';');
                var props = {};
                for (var p in propsArray) {
                  if (propsArray[p].split(':').length === 2) {
                    props[ propsArray[p].split(':')[0].trim() ] = propsArray[p].split(':')[1].trim();
                  }
                }
              }

              var geoJsonOverlay = L.geoJson(geojson, {
                pane: c['Top Level Overlay'] ? 'topOverlayPane' : 'overlayPane',
                style: function(feature) {
                  return {
                    stroke: feature.properties.stroke || props.stroke || true,
                    color: feature.properties.color || props.color || '#ff0000',
                    weight: feature.properties.weight || props.weight || 1,
                    opacity: feature.properties.opacity || props.opacity || 0.5,
                    lineCap: feature.properties.lineCap || props.lineCap || 'round',
                    lineJoin: feature.properties.lineJoin || props.lineJoin || 'round',
                    dashArray: feature.properties.dashArray || props.dashArray || '',
                    dashOffset: feature.properties.dashOffset || props.dashOffset || '',
                    fill: feature.properties.fill || props.fill || false,
                    fillColor: feature.properties.fillColor || props.fillColor || '#ffffff',
                    fillOpacity: feature.properties.fillOpacity || props.fillOpacity || 0.5,
                    fillRule: feature.properties.fillRule || props.fillRule || 'evenodd',
                  }
                }
              });

              geoJsonOverlay.addTo(jsonLayers);
            });

          }
          
          if (c['GeoJSON Overlay 2']) {
            $.getJSON(c['GeoJSON Overlay 2'], function(geojson) {

              if (c['GeoJSON Feature Properties 2']) {
                var propsArray = c['GeoJSON Feature Properties 2'].split(';');
                var props = {};
                for (var p in propsArray) {
                  if (propsArray[p].split(':').length === 2) {
                    props[ propsArray[p].split(':')[0].trim() ] = propsArray[p].split(':')[1].trim();
                  }
                }
              }

              var geoJsonOverlay2 = L.geoJson(geojson, {
                pane: c['Top Level Overlay'] ? 'topOverlayPane' : 'overlayPane',
                style: function(feature) {
                  return {
                    stroke: feature.properties.stroke || props.stroke || true,
                    color: feature.properties.color || props.color || '#ff0000',
                    weight: feature.properties.weight || props.weight || 1,
                    opacity: feature.properties.opacity || props.opacity || 0.5,
                    lineCap: feature.properties.lineCap || props.lineCap || 'round',
                    lineJoin: feature.properties.lineJoin || props.lineJoin || 'round',
                    dashArray: feature.properties.dashArray || props.dashArray || '',
                    dashOffset: feature.properties.dashOffset || props.dashOffset || '',
                    fill: feature.properties.fill || props.fill || false,
                    fillColor: feature.properties.fillColor || props.fillColor || '#ffffff',
                    fillOpacity: feature.properties.fillOpacity || props.fillOpacity || 0.5,
                    fillRule: feature.properties.fillRule || props.fillRule || 'evenodd',
                  }
                }
              });
              
              geoJsonOverlay2.addTo(jsonLayers);
            });
          }
        

          // Add chapter's overlay tiles if specified in options
          if (c['Tile Overlay']) {

            if (map.hasLayer(overlay)) {
              
              // currentTileUrl = overlay.getUrl(); // need to figure out how to get tile URL
              var currentTileUrl = null;

              var maxNativeZoomLevel = c['Max Native Zoom'] ? parseInt(c['Max Native Zoom']) : MAX_ZOOM;
              var overlayParams = {
                pane: c['Top Level Overlay'] ? 'topTilePane' : 'tilePane',
                detectRetina: DETECT_RETINA,
                maxNativeZoom: DETECT_RETINA ? (L.Browser.retina ? (maxNativeZoomLevel - 1) : maxNativeZoomLevel) : maxNativeZoomLevel,
              }
              
              // var tileUrlRetina = c['Tile Overlay Retina'] ? c['Tile Overlay Retina'] : c['Tile Overlay'];
              // var tileUrl = DETECT_RETINA ? (L.Browser.retina ? tileUrlRetina : c['Tile Overlay']) : c['Tile Overlay'];

              if (c['Tile Overlay'] != currentTileUrl) {
                map.removeLayer(overlay);
                overlay = L.tileLayer(c['Tile Overlay'], overlayParams);
                overlay.addTo(map);
              }

            } else {
              overlay = L.tileLayer(c['Tile Overlay'], overlayParams);
              overlay.addTo(map);
            }
            
            overlay.setOpacity(c['Tile Overlay Opacity'] ? c['Tile Overlay Opacity'] : 1);
            
          } else {
            // remove the overlay layer if it's not needed
            if (map.hasLayer(overlay)) {
              map.removeLayer(overlay);
            }
          }

          // show the correct legend overlay if provided
          if (c['Overlay Legend']) {
            $('#legend-image').attr('src', c['Overlay Legend']);
            $('#legend').show();
          } else {
            $('#legend').hide();
          }

          // Update layer credits
          var creditHtml =  c['Map Credit'] ? '<strong>' + c['Map Credit'] + '</strong> | ' : '';
          $('#layer-credit-wrapper').html(creditHtml);

          // and close the lightbox if it's open
          closeLightbox();

          // zoom to geojson if specified
          // currently not working on initial load, need to fix
          if ((c['Zoom to GeoJSON'])) { 
            map.flyToBounds(geoJsonOverlay.getBounds(), {
              maxZoom: MAX_ZOOM,
              animate: true,
              duration: 0.75, // default is 2 seconds
            });
          }

          // No need to iterate through the following chapters
          break;
        }
      }

    }

    /* back to top button at the bottom */
    $('#contents').append(" \
      <div id='space-at-the-bottom'> \
        <a href='#1'>  \
          <i class='fa fa-chevron-up'></i></br> \
          <small>Top</small>  \
        </a> \
      </div> \
    ");
    $('#space-at-the-bottom a').click(function() {
      $('#contents').animate({
        scrollTop: 0
      }, 0) 
     });


    endPixels = parseInt(getSetting('_pixelsAfterFinalChapter'));
    if (endPixels > 100) {
      $('#space-at-the-bottom').css({
        'height': (endPixels / 2) + 'px',
        'padding-top': (endPixels / 2) + 'px',
      });
    }

    var bounds = [];
    for (i in markers) {
      if (markers[i]) {
        markers[i].addTo(map);
        markers[i]['_pixelsAbove'] = pixelsAbove[i];
        markers[i].on('click', function() {
          var pixels = parseInt($(this)[0]['_pixelsAbove']) +20 ;
          $('div#contents').animate({
            scrollTop: pixels + 'px'}, 0);
        });
        bounds.push(markers[i].getLatLng());

        markers[i]['Section'] = chapters[i]['Section'];
        markers[i]._icon.className = markers[i]._icon.className += ' marker-section-inactive';
      }
    }  
    map.fitBounds(bounds);

    $('#map, #narration, #title').css('visibility', 'visible');
    $('div.loader').css('visibility', 'hidden');

    $('div#container0').addClass("in-focus");
    // $('div#contents').animate({scrollTop: '1px'});

    // Create navigation bar
    var navBar = $('<ol>', {
      id: 'nav-bar',
    });
    
    // var topButton = $('<li>', {
    //   class: 'nav-heading-item',
    // })
    //   .append('<a href="#1">Back to Top</a>')
    //   .click(function() {
    //     $('#contents').animate({
    //       scrollTop: 0
    //     }, getDuration(0, '#contents', 0.5))
    // });

    // Create heading navigation bar
    for (i in headingList) {
      headingList[i]['button'] = $('<a>', {
          href: '#' + headingList[i]['index'],
        }).append(headingList[i]['name']);
      headingList[i]['wrapper'] = $('<li>', {
          class: 'nav-heading-item',
          id: 'nav-heading-item-' + + headingList[i]['index'],
        }).append(headingList[i]['button']);
      navBar.append(headingList[i]['wrapper']);
    }
    $('div#nav').append(navBar);
    // fix the height in place
    $('div#nav').css({'height': $('#nav-bar').outerHeight()});

    // Create back-to-top link for mobile
    $('div#back-to-top').click(function(){
      $('div#contents').animate({
        scrollTop: '0px'}, 0);
    });

    var titleHeight = $('div#title').outerHeight(true);
    var headerHeight = $('div#header').outerHeight(true);
    var navHeight = $('div#nav').outerHeight(true);
    
    // Update links in navigation bar
    for (i in headingList) {
      headingList[i]['button'].data('position', $('#container' + headingList[i]['index']).offset().top);
      headingList[i]['button'].click(function() {
        var target = $(this).data('position') - titleHeight - navHeight - scrollThreshold; // - 120
        $('#contents').animate({
          scrollTop: target
        }, 0) // getDuration(target, '#contents', 0.5))
      });
    }

    // On first load, check hash and if it contains an number > 1, scroll down, else update map from initial location
    if ((!parseInt(location.hash.slice(1))) | parseInt(location.hash.slice(1))==1) {
      updateMap(initial = true);
    } else {
      var containerId = parseInt(location.hash.slice(1)) - 1;
      if (containerId > 0) {
        var target = $('#container' + containerId).offset().top - titleHeight - navHeight - scrollThreshold; //- 120;
        // scroll to 120 pixels from top of scroll area
        $('#contents').animate({
          scrollTop: target 
        }, 0) // getDuration(target, '#contents', 0.5));
    }
    } 

    // Add Google Analytics if the ID exists
    var ga = getSetting('_googleAnalytics');
    if ( ga && ga.length >= 10 ) {
      var gaScript = document.createElement('script');
      gaScript.setAttribute('src','https://www.googletagmanager.com/gtag/js?id=' + ga);
      document.head.appendChild(gaScript);

      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', ga);
    }

    // Create tooltips for birds
    $('.taxon').each(function() {
      var taxon = $(this).attr('data-taxon');
      //var tooltipTitle = //$(this).text();
      var tooltipTitle = b[taxon] ? b[taxon][0]['Common Name'] : '';
      var tooltipSubtitle = b[taxon] ? b[taxon][0]['Scientific Name'] : '';
      var tooltipImageId = b[taxon] ? b[taxon][0]['Plate'] : '';
      var tooltipImage = $('<img>', {
        class: 'tooltip-image',
        src: 'media/boa_plates_web/' + tooltipImageId + '.jpg',
      });
      var tooltipLinks = $('<ul>')
        // region codes: US-CA_239=Yolo Bypass, L443535=YBWA, L2498310=AutoLoop, L2357110=GreensLake, L109286=South
        .append($('<li>').append('<a href="https://www.allaboutbirds.org/guide/' + taxon + '" target=_blank>Bird Guide</a>'))
        .append($('<li>').append('<a href="https://ebird.org/barchart?r=US-CA_239&spp=' + taxon + '" target=_blank>Seasonal Frequency</a>'))
        //.append($('<li>').append('<a href="https://ebird.org/map/' + taxon + '?env.minX=-121.671&env.minY=38.502&env.maxX=-121.571&env.maxY=38.602" target=_blank>Local Observation Map</a>'))
        .append($('<li>').append('<a href="https://ebird.org/science/status-and-trends/' + taxon + '/abundance-map?static=true" target=_blank>Range & Abundance Maps</a>'))
        .append($('<li>').append('<a href="https://search.macaulaylibrary.org/catalog?regionCode=L443535&taxonCode=' + taxon + '" target=_blank>Photo Library</a>'))
        ;
      var tooltip = $('<div>', {
        class: 'tooltip',
      })
      .append('<p class=tooltip-title>' + tooltipTitle + '</p>')
      .append('<p class=tooltip-subtitle>' + tooltipSubtitle + '</p>')
      .append(tooltipLinks)
      .append(tooltipImage);
      $(this).append(tooltip);
    });

  }

  /**
   * Changes map attribution text in bottom-right
   */
  function changeAttribution() {
    var attributionHTML = $('.leaflet-control-attribution')[0].innerHTML;
    var credit = trySetting('_attributionText', '');
    var layerCreditWrapper = $('<div>', {
      id: 'layer-credit-wrapper',
    });
    $('.leaflet-control-attribution')[0].innerHTML = credit + ' | Built with ' + attributionHTML;
    $('.leaflet-control-attribution').prepend(layerCreditWrapper);
  }

  // closes the lightbox
  function closeLightbox() {
    document.getElementById('lightboxOverlay').style.display = "none";
    document.getElementById('lightbox').style.display = "none";
  }

  // calculates a duration for scrolling
  // rate e.g. 0.5 = 1000px/500ms
  // context e.g. window or '#content'
  function getDuration(target, context, rate) {
    var currentTop = $(context).scrollTop(),
    distance;
    distance = Math.abs(currentTop - target);
    return distance * rate;
    // return rate * 1000
  }

   // Method for precise rounding of floats
  roundFloat = function(num, places) {
   var p = Math.pow(10, places);
   var n = (num * p) * (1 + Number.EPSILON);
   return Math.round(n) / p;
 }

  function groupArrayOfObjects(list, key) {
   // https://www.codegrepper.com/code-examples/javascript/how+to+group+similar+data+in+javascript
  return list.reduce(function(rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
};

});