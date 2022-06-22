$(window).on('load', function() {
  var documentSettings = {};

  // Some constants, such as default settings
  const CHAPTER_ZOOM = 15;

  // First, try reading Options.csv
  $.get('csv/Options.csv', function(options) {

    $.get('csv/Chapters.csv', function(chapters) {
      initMap(
        $.csv.toObjects(options),
        $.csv.toObjects(chapters)
      )
    }).fail(function(e) { alert('Found Options.csv, but could not read Chapters.csv') });

  // If not available, try from the Google Sheet
  }).fail(function(e) {

    var parse = function(res) {
      return Papa.parse(Papa.unparse(res[0].values), {header: true} ).data;
    }

    // First, try reading data from the Google Sheet
    if (typeof googleDocURL !== 'undefined' && googleDocURL) {

      if (typeof googleApiKey !== 'undefined' && googleApiKey) {

        var apiUrl = 'https://sheets.googleapis.com/v4/spreadsheets/'
        var spreadsheetId = googleDocURL.split('/d/')[1].split('/')[0];

        $.when(
          $.getJSON(apiUrl + spreadsheetId + '/values/Options?key=' + googleApiKey),
          $.getJSON(apiUrl + spreadsheetId + '/values/Chapters?key=' + googleApiKey),
        ).then(function(options, chapters) {
          initMap(parse(options), parse(chapters))
        })

      } else {
        alert('You load data from a Google Sheet, you need to add a free Google API key')
      }

    } else {
      alert('You need to specify a valid Google Sheet (googleDocURL)')
    }

  })



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
    //var basemap = trySetting('_tileProvider', 'Stamen.TonerLite');
    //L.tileLayer.provider(basemap, {
    //    maxZoom: 18, 
    //    transparency: 'true', 
    //    opacity: 0.5,
    //}).addTo(map);

    L.tileLayer.provider('Esri.WorldImagery', {
      minZoom: 0,
      maxZoom: 11, 
      transparency: 'true', 
      opacity: 0.5,
    }).addTo(map);
    L.tileLayer.provider('USGSTNM.USImagery', {
      minZoom: 12,
      maxZoom: 20, 
      transparency: 'true', 
      opacity: 0.6,
    }).addTo(map);

  }

  /** Loads label tiles and adds them to the map */
  function addLabelOverlay() {
    // var Stamen_TerrainLines = L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/terrain-lines/{z}/{x}/{y}{r}.{ext}', {
    //   subdomains: 'abcd',
    //   minZoom: 0,
    //   maxZoom: 18,
    //   ext: 'png'
    // }).addTo(map);
    // var Stamen_TerrainLabels = L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/terrain-labels/{z}/{x}/{y}{r}.{ext}', {
    //   attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    //   subdomains: 'abcd',
    //   minZoom: 0,
    //   maxZoom: 18,
    //   ext: 'png',
    //   opacity: 0.5,
    //   }).addTo(map);
  }

  function initMap(options, chapters) {
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
    $('#logo').click(function() {
      $('#contents').animate({
        scrollTop: 0
      }, 0) // getDuration(0, '#contents', 0.5))
     });

    // Load tiles
    addBaseMap();
    addLabelOverlay();

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

    for (i in chapters) {
      var c = chapters[i];
      var cPrev = chapters[i-1];
      var cNext = chapters[i+1];

      if ( !isNaN(parseFloat(c['Latitude'])) && !isNaN(parseFloat(c['Longitude']))) {
        var lat = parseFloat(c['Latitude']);
        var lon = parseFloat(c['Longitude']);

        chapterCount += 1;

        markers.push(
          L.marker([lat, lon], {
            icon: L.ExtraMarkers.icon({
              icon: 'fa-number',
              number: c['Marker'] === 'Plain' ? '' : chapterCount,
              markerColor: c['Marker Color'] || 'blue'
            }),
            opacity: c['Marker'] === 'Hidden' ? 0 : 0.9,
            interactive: c['Marker'] === 'Hidden' ? false : true,
          }
        ));

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
      if (c['Media Credit Link']) {
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
      }

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

      // Gallery
      
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
        media = $('<' + mediaType + '>', {
          src: c['Media Link'],
          controls: mediaType != 'img' ? 'controls' : '',
          autoplay: mediaType === 'video' ? 'autoplay' : '',
          muted: mediaType === 'video' ? 'muted' : '',
          alt: c['Chapter']
        });

        var enableLightbox = getSetting('_enableLightbox') === 'yes' ? true : false;
        if (enableLightbox && mediaType === 'img') {
          var lightboxWrapper = $('<a></a>', {
            'data-lightbox': c['Media Link'],
            'href': c['Media Link'],
            // 'data-title': c['Chapter'],
            // 'data-alt': c['Chapter'],
          });
          media = lightboxWrapper.append(media);
        }

        mediaContainer = $('<div></div', {
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
          .append('<p class="description-main">' + c['Description'] + '</p>')
          .append(c['Description 2'] ? '<p class="description-detail">' + c['Description 2'] + '</p>' : '')
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
    
    // For each block (chapter), calculate how many pixels above it
    var titleHeight = $('div#title').outerHeight(true);
    var headerHeight = $('div#header').outerHeight(true);
    var navHeight = $('div#nav').outerHeight(true);
    pixelsAbove[0] = headerHeight + navHeight - 100; // this controls how far down you have to scroll to trigger the next chapter
    for (i = 1; i < chapters.length; i++) {
      // pixelsAbove[i] = pixelsAbove[i-1] + $('div#container' + (i-1)).height() + chapterContainerMargin;
      // pixelsAbove[i] = pixelsAbove[i-1] + $('div#container' + (i)).outerHeight(true);
      pixelsAbove[i] = $('#container' + i).offset().top - titleHeight - navHeight - 200;  
      // change at 100 pixels from top of scroll area
    }
    pixelsAbove.push(Number.MAX_VALUE);

    var currentSection = '';

    // Execute whenever the map scrolls, or on initial load
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
      }
      if (currentPosition < titleHeight + headerHeight) {
        $('#nav-bar').css('position', 'static');
      }
      
      for (var i = 0; i < pixelsAbove.length - 1; i++) {

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

          // Remove GeoJson overlay layer(s) existing
          // if (map.hasLayer(geoJsonOverlay)) {
          //   map.removeLayer(geoJsonOverlay);
          // }
          // if (map.hasLayer(geoJsonOverlay2)) {
          //   map.removeLayer(geoJsonOverlay2);
          // }        

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
          if (map.hasLayer(geoJsonOverlay)) {
            map.removeLayer(geoJsonOverlay);
          }
          if (map.hasLayer(geoJsonOverlay2)) {
            map.removeLayer(geoJsonOverlay2);
          }     

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

              geoJsonOverlay = L.geoJson(geojson, {
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
              }).addTo(map);
            });

            //if (!(c['Latitude'] && c['Longitude'])) {
            //  map.fitBounds(geoJsonOverlay.getBounds());
            //}
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

              geoJsonOverlay2 = L.geoJson(geojson, {
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
              }).addTo(map);
            });
          }
          
          // Add chapter's overlay tiles if specified in options
          if (c['Tile Overlay']) {

            if (map.hasLayer(overlay)) {
              
              // currentTileUrl = overlay.getUrl(); // need to figure out how to get tile URL
              currentTileUrl = null;
              
              if (c['Tile Overlay'] != currentTileUrl) {
                // remove the existing overlay layer
                map.removeLayer(overlay);
                // make a new overlay layer
                overlay = L.tileLayer(c['Tile Overlay']).addTo(map);
              }

            } else {
              // create a new overlay layer if one doesn't already exist
              overlay = L.tileLayer(c['Tile Overlay']).addTo(map);
            }

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
            scrollTop: pixels + 'px'});
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

    var titleHeight = $('div#title').outerHeight(true);
    var headerHeight = $('div#header').outerHeight(true);
    var navHeight = $('div#nav').outerHeight(true);
    
    // Update links in navigation bar
    for (i in headingList) {
      headingList[i]['button'].data('position', $('#container' + headingList[i]['index']).offset().top);
      headingList[i]['button'].click(function() {
        var target = $(this).data('position') - titleHeight - navHeight - 120
        $('#contents').animate({
          scrollTop: target
        }, 0) // getDuration(target, '#contents', 0.5))
      });
    }

    // On first load, check hash and if it contains an number, scroll down, else update map from initial location
    if (!parseInt(location.hash.slice(1))) {
      updateMap(initial = true);
    } else {
      var containerId = parseInt(location.hash.slice(1)) - 1;
      if (containerId > 0) {
        var target = $('#container' + containerId).offset().top - titleHeight - navHeight - 120;
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
    $('.leaflet-control-attribution')[0].innerHTML = credit + ' | ' + attributionHTML;
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

});

