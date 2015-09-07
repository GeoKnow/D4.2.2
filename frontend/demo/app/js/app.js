jassa = new Jassa(Promise, $.ajax);

angular.module(
  'jassa.ui.edit.demo.widgets',
  ['dddi', 'smart-table', 'ngSanitize', 'ui.jassa', 'ui.bootstrap', 'ui.select', 'ui.jassa.edit', 'ui.jassa.rex', 'ui.codemirror', 'ngAnimate', 'ngStorage'])

  .config(function(GeocodingLookupProvider) {
    /*
     GeocodingLookupProvider.setConfiguration({
     service: ['LinkedGeoData', 'Nominatim'],
     defaultService: true
     });
     */
    // set NOKIA service
    GeocodingLookupProvider.setService({
      label: 'Nokia HERE',
      serviceType: 'rest',
      url: 'http://geocoder.cit.api.here.com/6.2/geocode.json',
      data: {
        app_id: 'DemoAppId01082013GAL',
        app_code: 'AJKnXv84fjrb0KIHawS0Tg',
        additionaldata: 'IncludeShapeLevel,default',
        mode: 'retrieveAddresses',
        searchtext: '%KEYWORD%'
      },
      fnSuccess: function(response) {
        var data = response.data.Response.View.length > 0 ? response.data.Response.View[0].Result : [];
        var resultSet = [];
        for(var i in data) {
          if(data[i].Location.hasOwnProperty('Shape')) {
            resultSet.push({
              'firstInGroup': false,
              'wkt': data[i].Location.Shape.Value,
              'label': data[i].Location.Address.Label,
              'group': 'Nokia HERE'
            });
          }
        }
        return resultSet;
      }
    });

    // set LINKEDGEODATA service
    GeocodingLookupProvider.setService({
      label: 'LinkedGeoData (User Config)',
      serviceType: 'sparql',
      endpoint: 'http://linkedgeodata.org/vsparql',
      graph: 'http://linkedgeodata.org/ne/',
      prefix: {
        ogc: 'http://www.opengis.net/ont/geosparql#',
        geom: 'http://geovocab.org/geometry#'
      },
      query: '{'
        +' Graph <http://linkedgeodata.org/ne/> {'
        +' ?s a <http://linkedgeodata.org/ne/ontology/Country> ;'
        +' rdfs:label ?l ;'
        +' geom:geometry ['
        +'  ogc:asWKT ?g'
        +' ] '
        +' FILTER regex(?l, "%KEYWORD%", "i") '
        +' } '
        +'}',
      sponateTemplate: [{
        id: '?s',
        label: '?l',
        wkt: '?g'
      }],
      limit: 5,
      fnSuccess: function(response) {
        var data = response;
        var resultSet = [];
        if (data.length > 0) {
          for(var i in data) {
            resultSet.push({
              'firstInGroup': false,
              'wkt': data[i].val.wkt,
              'label': data[i].val.label,
              'group': 'LinkedGeoData (User Config)'
            });
          }
        }
        return resultSet;
      }
    });
  })

  .controller('AppCtrl', ['$scope', '$dddi', '$location', '$anchorScroll', '$timeout', '$http', '$q', '$localStorage',
    function($scope, $dddi, $location, $anchorScroll, $timeout, $http, $q, $localStorage) {

      $scope.$storage = $localStorage.$default({
        setup: {
          // GENERAL
          inputSourceEndpoint: 'http://localhost/sparql',
          inputTargetEndpoint: 'http://localhost/sparql',
          inputPrefixes: '',
          inputConcept: '',
          selGeocoderService: 'nominatim',
          pushChangesets: 'false',
          // DELETION
          clearExistingGeometryLiterals: 'true',
          delGeovocab: {
            wgs84: false,
            geosparql: false,
            geoowl: false
          },
          inputDeletionPath: '',
          // INSERTION
          insertGeovocab: 'wgs84',
          inputInsertPath: ''
        }
      });

      $scope.configuration = false;

      $scope.selectDataset = function(dataset) {
        $scope.configuration = false;

        var datasetSelected = dataset ? true : false;
        if (datasetSelected) {
          $scope.selectedDataset = dataset;
          $scope.rowCollection = [];
          $scope.locationSuggestions = {};
          $scope.location = '';
          $scope.sparqlUpdateTriples = {
            source: [],
            geocoder: []
          };

          if (dataset === 'fp7') {
            fp7($scope);
          }
          if (dataset === 'cycling') {
            cycling($scope);
          }
        }
      };

      $scope.config = function() {
        $scope.selectedDataset = null;
        $scope.configuration = true;
      };

      var concept = new jassa.sparql.Concept(
        jassa.sparql.ElementString.create('?s a <http://fp7-pp.publicdata.eu/ontology/Partner>'),
        jassa.rdf.NodeFactory.createVar('s'));

      var sparqlService = jassa.service.SparqlServiceBuilder
        .http('http://fp7-pp.publicdata.eu/sparql', ['http://fp7-pp.publicdata.eu/'], {type: 'POST'})
        .create();

      jassa.service.ServiceUtils.fetchItemsConcept(sparqlService, concept, 10).then(function(nodes) {
        console.log('Partner:', JSON.stringify(nodes));

        var query = new jassa.sparql.Query();
        var s = jassa.rdf.NodeFactory.createUri(nodes[1].uri);
        var p = jassa.rdf.NodeFactory.createVar('p');
        var o = jassa.rdf.NodeFactory.createVar('o');

        var triple = new jassa.rdf.Triple(s, p, o);

        query.getProject().add(p);
        query.getProject().add(o);
        query.setQueryPattern(new jassa.sparql.ElementTriplesBlock([triple]));
        query.setLimit(100);
        console.log('sparql query', query.toString());

        var qe = sparqlService.createQueryExecution(query);

        qe.execSelect()
          .then(function(rs) {
            console.log('results for subject', rs);
            var properties = {};
            while(rs.hasNext()) {
              var binding = rs.nextBinding();
              properties[binding.get(p).getUri()] = binding.get(o).isUri() ? binding.get(o).getUri() : binding.get(o).getLiteral().toString();
            }
            console.log('properties', properties);
          })
      }, function() {
        console.log('Fail');
      });


      var defaultServices = {
        Nominatim: {
          label: 'Nominatim',
          serviceType: 'rest',
          url: 'http://nominatim.openstreetmap.org/search/?format=json&polygon_text=1&q=',
          data: {
            format: 'json',
            polygon_text: '1',
            q: '%KEYWORD%'
          },
          fnSuccess: function(response) {
            var data = response.data;
            var resultSet = [];
            for (var i in data) {
              if (data[i].hasOwnProperty('geotext')) {
                resultSet.push({
                  firstInGroup: false,
                  wkt: data[i].geotext,
                  label: data[i].display_name,
                  group: 'Nominatim'
                });
              }
            }
            return resultSet;
          }
        }
      };

      $scope.restServiceRequest = function(service, keyword) {
        var queryString = queryData(defaultServices[service].data).replace(/%KEYWORD%/gi,keyword);
        return $http({
          'method': 'GET',
          'url': defaultServices[service].url+'?'+queryString,
          'cache': true,
          'headers' : {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });
      };

      var queryData = function(data) {
        var ret = [];
        for (var d in data) {
          ret.push(d + '=' + data[d]);
        }
        return ret.join('&');
      };



      // return location without special chars - _
      $scope.extractLocation = function(string) {

        var slashPostion = string.lastIndexOf('/') + 1;
        var hashPostion = string.lastIndexOf('#') + 1;

        // EXAMPLE
        // string www.clelicy.de/radsport_ontologie#Mont_Ventoux
        // slashPosition 15
        // hashPosition 34
        // hash is the last special char (/ or #)

        // last special char = /
        if (slashPostion > hashPostion) {
          return string.substr(string.lastIndexOf('/') + 1).replace(/-|_|'|’/gi,' ');
        }
        // last special char = #
        if (hashPostion > slashPostion) {
          return string.substr(string.lastIndexOf('#') + 1).replace(/-|_|'|’/gi,' ');
        }

        // default
        return null;

      };

      // return location with special chars
      $scope.extractLocationsLocalPart = function(string) {
        var slashPostion = string.lastIndexOf('/') + 1;
        var hashPostion = string.lastIndexOf('#') + 1;

        // EXAMPLE
        // string www.clelicy.de/radsport_ontologie#Mont_Ventoux
        // slashPosition 15
        // hashPosition 34
        // hash is the last special char (/ or #)

        // last special char = /
        if (slashPostion > hashPostion) {
          return string.substr(string.lastIndexOf('/') + 1);
        }
        // last special char = #
        if (hashPostion > slashPostion) {
          return string.substr(string.lastIndexOf('#') + 1);
        }

        // default
        return null;
      };

      var setGeocodeForSameLocations = function(location, geocode) {
        for (var i in $scope.rowCollection) {
          var currLocation = $scope.rowCollection[i].val.address.city;
          if (location === currLocation) {
            console.log('same city as clicked', $scope.rowCollection[i].val.address.id);
            $scope.rowCollection[i].val.address.geocoding.city = {
              selected : geocode
            }
          }
        }
      };

      $scope.runGeocoderForLocation = function(locationUri) {
        var extractedLocation = $scope.extractLocation(locationUri);
        if (!$scope.locationSuggestions.hasOwnProperty(locationUri)) {
          console.log('yes, ' + locationUri + ' was already fetched.');
          $scope.restServiceRequest('Nominatim', extractedLocation).then(function(geocoderResult) {
            console.log('Possible values for first city for first entry ' + locationUri, geocoderResult);
            $scope.locationSuggestions[locationUri] = geocoderResult.data;
          });
        }
      };

      $scope.setGeocode = function(item, city) {
        console.log('item', item);
        console.log('city', city);
        console.log('rowCollection', $scope.rowCollection);
        setGeocodeForSameLocations(city, item);
        addNewTriplesForLocation(city, item.geotext);
      };

      $scope.newGraph = function() {
        return new jassa.rdf.GraphImpl();
      };

      $scope.graphToTurtle = function(graph, prefixMapping) {
        var talis = graph ? jassa.io.TalisRdfJsonUtils.triplesToTalisRdfJson(graph) : null;
        var r = talis ? jassa.io.TalisRdfJsonUtils.talisRdfJsonToTurtle(talis, prefixMapping) : '';
        return r;
      };

      $scope.createInsertRequest = function(graph, prefixMapping) {
        var result;
        if(graph) {
          var quads = jassa.sparql.QuadUtils.triplesToQuads(graph);
          result = '' + new jassa.sparql.UpdateDataInsert(quads);
        } else {
          result = '';
        }
        return result;
      };

      // Code mirror setup
      $scope.editorOptions = {
        ttl: {
          lineWrapping : true,
          lineNumbers: true,
          tabMode: 'indent',
          matchBrackets: true,
          mode: 'text/turtle',
          readOnly: true
        }
      };




      var addNewTriplesForLocation = function(locationUri, geocodeAsWkt) {;
        var prefix = {
          geom: 'http://geovocab.org/geometry#',
          geocoder: 'http://www.clelicy.de/geocodes/Geocoder_Results/',
          ogc: 'http://www.opengis.net/ont/geosparql#'
        };

        // build triples
        var s = jassa.rdf.NodeFactory.createUri(locationUri);
        var p = jassa.rdf.NodeFactory.createUri(prefix.geom + 'geometry');
        var newLocationUri = jassa.rdf.NodeFactory.createUri(prefix.geocoder + $scope.extractLocationsLocalPart(locationUri));

        // as wkt
        var asWKT = jassa.rdf.NodeFactory.createUri(prefix.ogc + 'asWKT');
        var newLocationGeocode = jassa.rdf.NodeFactory.createTypedLiteralFromValue(geocodeAsWkt, 'http://www.opengis.net/ont/sf#wktLiteral');

        // type
        var typeClass = jassa.rdf.NodeFactory.createUri('http://www.clelicy.de/geocodes/results');

        var quad1 = new jassa.sparql.Quad(null, s, p, newLocationUri);
        var quad2 = new jassa.sparql.Quad(null, newLocationUri, asWKT, newLocationGeocode);
        var quad3 = new jassa.sparql.Quad(null, newLocationUri, jassa.vocab.rdf.type, typeClass);

        // check, if already information are stored
        var locationUriInGraph = _.find($scope.sparqlUpdateTriples.source, function(quad) {
          return quad.subject.uri === locationUri;
        });

        console.log('hasLocationInfo', locationUriInGraph);

        // no information for location if locationUriInGraph is undefined
        if (locationUriInGraph === undefined) {
          // insert new quads
          $scope.sparqlUpdateTriples.source.push(quad1);
          $scope.sparqlUpdateTriples.geocoder.push(quad2);
          $scope.sparqlUpdateTriples.geocoder.push(quad3);
        } else {
          // delete old qudas and insert new quads
          $scope.sparqlUpdateTriples.geocoder = _.reject($scope.sparqlUpdateTriples.geocoder, function(quad) {
            // return all except the old wkt value for the location
            return quad.subject.uri === newLocationUri.uri;
          });
          $scope.sparqlUpdateTriples.geocoder.push(quad2);
          $scope.sparqlUpdateTriples.geocoder.push(quad3);
        }
        console.log('sparqlUpdateTriples', $scope.sparqlUpdateTriples);
      };

      var updateService = new jassa.service.SparqlUpdateHttp('http://localhost:8890/sparql', ['http://www.clelicy.de/geocodes']);

      $scope.UpdateUtils = jassa.service.UpdateUtils;

      console.log('UpdateUtils: ', $scope.UpdateUtils);

      /*
      $scope.performUpdate = function() {
        //var updateService = $scope.active.service.updateService;
        console.log('perform update');
        var x = jassa.service.UpdateUtils.performUpdate(updateService, $scope.sparqlUpdateTriples.geocoder, {})
          .then(function() {

          });

      };
      */

      $scope.performUpdate = function() {
        var str;

        str = $scope.createInsertRequest($scope.sparqlUpdateTriples.geocoder);
        var p1 = updateService.createUpdateExecution(str).execUpdate();
        Promise.all([p1]).then(function () {
          alert('Success - I will now refresh - ya, will make that nicer soon');
          location.reload();
        }, function () {
          alert('Failed');
        });
      };

      $scope.performNominatimLookup = function() {
        var extractedLocation = 'Leipzig Karl-Liebknecht-Str. 100';
        $scope.restServiceRequest('Nominatim', extractedLocation).then(function(geocoderResult) {
          console.log('Possible values for first city for first entry ' + extractedLocation, geocoderResult);
          // graph
          var graph = new jassa.rdf.GraphImpl();
          // rdf_type
          var s = jassa.rdf.NodeFactory.createUri("http://example.org/ontology/geocodeCandidateResource1");
          var p = jassa.vocab.rdf.type;
          var o = jassa.rdf.NodeFactory.createUri("http://example.org/ontology/GeoCodeCandidateResult");
          var tType = new jassa.rdf.Triple(s, p, o);
          // timestamp


          console.log("Triple: " + triple);
          graph.add(triple);
          console.log('Graph', graph.toArray());
        });
      };

      $scope.getRandomID = function(){
        return Math.floor((Math.random()*6)+1);
      };

      $scope.toJSON = function(json) {
        return JSON.stringify(json);
      };

      $scope.getDateTime = function() {
        return moment().format();
      };



      $scope.copy = angular.copy;

      //showAngularStats();
    }
  ]);