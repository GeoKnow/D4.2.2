jassa = new Jassa(Promise, $.ajax);

angular.module(
  'jassa.ui.edit.demo.widgets',
  ['dddi', 'smart-table', 'ngSanitize', 'ui.jassa', 'ui.bootstrap', 'ui.select', 'ui.jassa.edit', 'ui.jassa.rex', 'ui.codemirror', 'ngAnimate'])

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

  .controller('AppCtrl', ['$scope', '$dddi', '$location', '$anchorScroll', '$timeout', '$http', '$q',
    function($scope, $dddi, $location, $anchorScroll, $timeout, $http, $q) {

      $scope.selectDataset = function(dataset) {
        $scope.selectedDataset = dataset;
        $scope.rowCollection = [];
        $scope.locationSuggestions = {};
        $scope.location = '';
        $scope.sparqlUpdateTriples = [];
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


      $scope.fp7 = function() {
        var sparqlService = jassa.service.SparqlServiceBuilder
          .http('http://fp7-pp.publicdata.eu/sparql', ['http://fp7-pp.publicdata.eu/'], {type: 'POST'})
          .create();

        $scope.selectDataset('fp7');
        var store = new jassa.sponate.StoreFacade(sparqlService, {
          // add new prefixes
          'fp7o': 'http://fp7-pp.publicdata.eu/ontology/'
        });

        store.addMap({
          name: 'projects',
          template: [{
            id: '?s',
            name: '?l',
            address: {
              id: '?address',
              city: '?city',
              country: '?country',
              geocoding: {
                city: '',
                country: ''
              }
            }
          }],
          from: '?s a fp7o:Partner ; rdfs:label ?l ; fp7o:address ?address . ?address fp7o:city ?city . ?address fp7o:country ?country'
        });

        store.projects.getListService().fetchItems(null, 20).then(function(entries) {
          entries.then(function(response) {
            console.log('ENTRIES: ', response);

            var cityUri = response[0].val.address.city;
            var cityLabel = cityUri.substr(cityUri.lastIndexOf('/') + 1);
            console.log('Address for first entry: ', cityLabel);
            var promise = restServiceRequest('Nominatim', cityLabel);
            promise.then(function(response) {
              console.log('Possible values for first city for first entry', response);
            });
            $scope.rowCollection = response;
            $scope.displayedCollection = [].concat($scope.rowCollection);
          })
        });
      };

      $scope.cycling = function() {
        var sparqlService = jassa.service.SparqlServiceBuilder
          .http('http://localhost/ontowiki/sparql', ['http://www.clelicy.de/Radsport_Ontologie'], {type: 'POST'})
          .virtFix()
          .create();

        $scope.selectDataset('cycling');
        var store = new jassa.sponate.StoreFacade(sparqlService, {
          // add new prefixes
        });

        store.addMap({
          name: 'cycling',
          template: [{
            id: '?stageLocation',
            address: {
              id: '?stageLocation',
              city: '?stageLocation',
              geocoding: {
                city: ''
              }
            }
          }],
          from: '?stageLocation a <http://schema.org/Place>'
        });

        store.cycling.getListService().fetchItems(null, 20).then(function(entries) {
          entries.then(function(response) {
            console.log('ENTRIES: ', response);

            var stageUri = response[0].val.address.id;
            var stageLabel = stageUri.substr(stageUri.lastIndexOf('/') + 1);
            console.log('Address for first entry: ', stageLabel);
            var promise = restServiceRequest('Nominatim', stageLabel);
            promise.then(function(response) {
              console.log('Possible values for first city for first entry', response);
            });
            $scope.rowCollection = response;
            $scope.displayedCollection = [].concat($scope.rowCollection);
          })
        });
      };

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

      var restServiceRequest = function(service, keyword) {
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



      var extractLocation = function(string) {
        return string.substr(string.lastIndexOf('/') + 1).replace(/-/gi,' ');
      };

      var extractLocationsLocalPart = function(string) {
        return string.substr(string.lastIndexOf('/') + 1);
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
        var extractedLocation = extractLocation(locationUri);
        if (!$scope.locationSuggestions.hasOwnProperty(locationUri)) {
          console.log('yes, ' + locationUri + ' was already fetched.');
          restServiceRequest('Nominatim', extractedLocation).then(function(geocoderResult) {
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
          geocoder: 'http://geocoder.org/geometry#',
          ogc: 'http://www.opengis.net/ont/geosparql#'
        };

        // build triples
        var s = jassa.rdf.NodeFactory.createUri(locationUri);
        var p = jassa.rdf.NodeFactory.createUri(prefix.geom + 'geometry');
        var newLocationUri = jassa.rdf.NodeFactory.createUri(prefix.geocoder + extractLocationsLocalPart(locationUri));

        var asWKT = jassa.rdf.NodeFactory.createUri(prefix.ogc + 'asWKT');
        var newLocationGeocode = jassa.rdf.NodeFactory.createPlainLiteral(geocodeAsWkt);

        var quad1 = new jassa.sparql.Quad(null, s, p, newLocationUri);
        var quad2 = new jassa.sparql.Quad(null, newLocationUri, asWKT, newLocationGeocode);

        // check, if already information are stored
        var locationUriInGraph = _.find($scope.sparqlUpdateTriples, function(quad) {
          return quad.subject.uri === locationUri;
        });

        console.log('hasLocationInfo', locationUriInGraph);

        // no information for location if locationUriInGraph is undefined
        if (locationUriInGraph === undefined) {
          // insert new quads
          $scope.sparqlUpdateTriples.push(quad1);
          $scope.sparqlUpdateTriples.push(quad2);
        } else {
          // delete old qudas and insert new quads
          $scope.sparqlUpdateTriples = _.reject($scope.sparqlUpdateTriples, function(quad) {
            // return all except the old wkt value for the location
            return quad.subject.uri === newLocationUri.uri;
          });
          $scope.sparqlUpdateTriples.push(quad2);
        }
        console.log('sparqlUpdateTriples', $scope.sparqlUpdateTriples);
      };

      $scope.copy = angular.copy;

      //showAngularStats();
    }
  ]);