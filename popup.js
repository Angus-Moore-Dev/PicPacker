let selectedMedia = new Set();

// Function to scrape media from the active tab
function scrapeMedia()
{
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs)
    {
        chrome.scripting.executeScript(
        {
            target: {tabId: tabs[0].id},
            function: () =>
            {
                const media = [];
                // Collect images, including those in srcset and background images
                const getAllImages = () =>
                {
                    // Get images from img tags
                    const imgTags = Array.from(document.getElementsByTagName('img'));
                    
                    // Get background images
                    const elementsWithBg = Array.from(document.getElementsByTagName('*'));
                    const backgroundImages = elementsWithBg
                        .map(el => window.getComputedStyle(el).backgroundImage)
                        .filter(bg => bg !== 'none')
                        .map(bg => bg.replace(/^url\(['"](.+)['"]\)$/, '$1'));
                    
                    // Get srcset images
                    const srcsetImages = imgTags
                        .filter(img => img.srcset)
                        .map(img => img.srcset.split(',')
                            .map(src => src.trim().split(' ')[0]))
                        .flat();
                    
                    // Combine all sources
                    const allSources = [
                        ...imgTags.map(img => img.src),
                        ...backgroundImages,
                        ...srcsetImages
                    ];
                    
                    return [...new Set(allSources)]
                        .filter(src => src && src.startsWith('http'))
                        .map(src => {
                            // Handle URLs with query parameters
                            try {
                                const url = new URL(src);
                                // If URL has an image parameter, use that as the source
                                if (url.searchParams.has('image') || url.searchParams.has('url')) {
                                    const imageUrl = url.searchParams.get('image') || url.searchParams.get('url');
                                    return decodeURIComponent(imageUrl);
                                }
                                return src;
                            } catch (e) {
                                return src;
                            }
                        });
                };

                // Get all images and add to media array
                getAllImages().forEach(src =>
                {
                    // Check if image exists and is accessible
                    fetch(src, { method: 'HEAD' })
                        .then(response => {
                            if (response.ok) {
                                media.push({
                                    type: 'image',
                                    src: src,
                                    filename: src.split('/').pop().split('?')[0] // Remove query parameters from filename
                                });
                            }
                        })
                        .catch(() => {
                            // Skip inaccessible images
                        });
                });

                // Collect videos
                document.querySelectorAll('video').forEach(video =>
                {
                    if (video.src && video.src.startsWith('http'))
                    {
                        // Check if video exists and is accessible
                        fetch(video.src, { method: 'HEAD' })
                            .then(response => {
                                if (response.ok) {
                                    media.push({
                                        type: 'video',
                                        src: video.src,
                                        filename: video.src.split('/').pop().split('?')[0] // Remove query parameters from filename
                                    });
                                }
                            })
                            .catch(() => {
                                // Skip inaccessible videos
                            });
                    }
                });

                // Wait for all fetch checks to complete
                return new Promise(resolve => {
                    setTimeout(() => resolve(media), 1000);
                });
            }
        }, displayMedia);
    });
}

// Function to display scraped media in the grid
function displayMedia(results)
{
    const mediaGrid = document.getElementById('media-grid');
    const media = results[0].result;

    media.forEach((item, index) =>
    {
        const mediaItem = document.createElement('div');
        mediaItem.className = 'media-item';
        mediaItem.dataset.index = index;

        if (item.type === 'image')
        {
            const img = document.createElement('img');
            img.src = item.src;
            img.onerror = () => {
                mediaItem.remove(); // Remove if image fails to load
            };
            mediaItem.appendChild(img);
        }
        else
        {
            const video = document.createElement('video');
            video.src = item.src;
            video.controls = true;
            video.onerror = () => {
                mediaItem.remove(); // Remove if video fails to load
            };
            mediaItem.appendChild(video);
        }

        mediaItem.addEventListener('click', () =>
        {
            mediaItem.classList.toggle('selected');
            if (mediaItem.classList.contains('selected'))
            {
                selectedMedia.add(item);
            }
            else
            {
                selectedMedia.delete(item);
            }
        });

        mediaGrid.appendChild(mediaItem);
    });
}

// Function to download selected media
function downloadSelected()
{
    if (selectedMedia.size === 0)
    {
        alert('Please select at least one item to download');
        return;
    }

    // Download each selected item individually
    selectedMedia.forEach(item =>
    {
        chrome.downloads.download({
            url: item.src,
            filename: item.filename,
            saveAs: false
        }, (downloadId) =>
        {
            if (chrome.runtime.lastError)
            {
                console.error('Download failed:', chrome.runtime.lastError);
                alert(`Failed to download ${item.filename}`);
            }
        });
    });
}

// Event listeners
document.addEventListener('DOMContentLoaded', scrapeMedia);
document.getElementById('clear-all').addEventListener('click', () =>
{
    selectedMedia.clear();
    document.querySelectorAll('.media-item').forEach(item =>
    {
        item.classList.remove('selected');
    });
});
document.getElementById('download-selected').addEventListener('click', downloadSelected);
document.getElementById('refresh').addEventListener('click', () => {
    // Clear the existing grid
    const mediaGrid = document.getElementById('media-grid');
    mediaGrid.innerHTML = '';
    
    // Clear selected media
    selectedMedia.clear();
    
    // Re-run the scraping
    scrapeMedia();
});