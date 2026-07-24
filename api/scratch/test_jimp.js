import Jimp from 'jimp';
console.log('Jimp version:', Jimp);

Jimp.read('../uploads/default-thumbnail.jpg')
  .then(img => {
    console.log('Successfully read image. Image properties:', img.bitmap.width, img.bitmap.height);
    return img.writeAsync('scratch/jimp-test-out.jpg');
  })
  .then(() => {
    console.log('Successfully wrote image!');
  })
  .catch(err => {
    console.error('Error with Jimp:', err);
  });
