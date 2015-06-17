var cycling = function($scope) {
  var sparqlService = jassa.service.SparqlServiceBuilder
    .http('http://localhost:8890/sparql', ['http://www.clelicy.de/Radsport_Ontologie'], {type: 'POST'})
    .virtFix()
    .create();


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
      var stageLabel = $scope.extractLocation(stageUri);
      var promise = $scope.restServiceRequest('Nominatim', stageLabel);
      promise.then(function(response) {
        console.log('Possible values for first city for first entry', response);
      });
      $scope.rowCollection = response;
      $scope.displayedCollection = [].concat($scope.rowCollection);
    })
  });
};