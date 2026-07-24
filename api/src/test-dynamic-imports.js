async function run() {
  try {
    console.log('Importing config...');
    await import('./config.js');
    console.log('Imported config');
    
    console.log('Importing server...');
    await import('./server.js');
    console.log('Imported server');
    
    console.log('Importing db...');
    await import('./db.js');
    console.log('Imported db');
    
    console.log('Importing seed...');
    await import('./seed.js');
    console.log('Imported seed');
    
    console.log('Importing auth...');
    await import('./routes/auth.js');
    console.log('Imported auth');
    
    console.log('Importing profiles...');
    await import('./routes/profiles.js');
    console.log('Imported profiles');
    
    console.log('Importing reels...');
    await import('./routes/reels.js');
    console.log('Imported reels');
    
    console.log('Importing creators...');
    await import('./routes/creators.js');
    console.log('Imported creators');
    
    console.log('Importing movies...');
    await import('./routes/movies.js');
    console.log('Imported movies');
    
    console.log('Importing news...');
    await import('./routes/news.js');
    console.log('Imported news');
    
    console.log('Importing watchlist...');
    await import('./routes/watchlist.js');
    console.log('Imported watchlist');
    
    console.log('Importing streams...');
    await import('./routes/streams.js');
    console.log('Imported streams');
    
    console.log('Importing comments...');
    await import('./routes/comments.js');
    console.log('Imported comments');
    
    console.log('Importing notifications...');
    await import('./routes/notifications.js');
    console.log('Imported notifications');
    
    console.log('Importing recommendations...');
    await import('./routes/recommendations.js');
    console.log('Imported recommendations');
    
    console.log('Importing events...');
    await import('./events.js');
    console.log('Imported events');
  } catch (err) {
    console.error('Error during import:', err);
  }
}
run();
