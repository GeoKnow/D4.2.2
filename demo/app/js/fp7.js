var fp7 = function($scope) {
  var sparqlService = jassa.service.SparqlServiceBuilder
    .http('http://fp7-pp.publicdata.eu/sparql', ['http://fp7-pp.publicdata.eu/'], {type: 'POST'})
    .create();

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
      var cityLabel = $scope.extractLocation(cityUri);
      console.log('Address for first entry: ', cityLabel);
      var promise = $scope.restServiceRequest('Nominatim', cityLabel);
      promise.then(function(response) {
        console.log('Possible values for first city for first entry', response);
      });
      $scope.rowCollection = response;
      $scope.displayedCollection = [].concat($scope.rowCollection);
    })
  });
};