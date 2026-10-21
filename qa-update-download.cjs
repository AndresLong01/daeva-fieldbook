// Exercise the real NSIS updater against a local feed; never run the installer.
const {app}=require('electron');
const {NsisUpdater}=require('electron-updater');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const crypto=require('node:crypto');
const yaml=require('js-yaml');
const assert=require('node:assert/strict');
const output=path.join(__dirname,'..','qa-update-download');
app.setPath('userData',path.join(output,'profile'));
app.whenReady().then(async()=>{
  await fsp.mkdir(output,{recursive:true});
  const release=path.join(__dirname,'..','..','outputs','Daeva-Fieldbook-1.0');
  const manifest=yaml.load(await fsp.readFile(path.join(release,'latest.yml'),'utf8'));
  const filename=manifest.files[0].url;
  assert.equal(path.basename(filename),filename);
  const installer=path.join(release,filename);
  let corrupt=true,requests=0;
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url,'http://localhost').pathname;
    if(pathname==='/latest.yml'){
      const payload=JSON.parse(JSON.stringify(manifest));
      if(corrupt){payload.sha512=Buffer.alloc(64).toString('base64');payload.files[0].sha512=payload.sha512;}
      response.writeHead(200,{'Content-Type':'text/yaml'});response.end(yaml.dump(payload));
    }else if(pathname===`/${filename}`){requests++;response.writeHead(200,{'Content-Length':fs.statSync(installer).size});fs.createReadStream(installer).pipe(response);}
    else{response.writeHead(404);response.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}`;
  let checksumRejected=false,installOptions=null,quitRequested=false;
  for(const test of ['corrupt','valid']){
    const config=path.join(output,`${test}-update.yml`);
    await fsp.writeFile(config,yaml.dump({provider:'generic',url,updaterCacheDirName:`qa-${test}`}));
    const updater=new NsisUpdater({provider:'generic',url});
    updater.app={version:'0.99.0',name:'Daeva Fieldbook QA',isPackaged:true,userDataPath:path.join(output,'profile'),baseCachePath:path.join(output,'cache'),appUpdateConfigPath:config,whenReady:()=>Promise.resolve(),onQuit:()=>{},quit:()=>{quitRequested=true;}};
    updater.currentVersion=new updater.currentVersion.constructor('0.99.0');updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.disableDifferentialDownload=true;updater.disableWebInstaller=true;updater.logger=null;
    const check=await updater.checkForUpdates();
    assert.equal(check.updateInfo.version,'1.0.0');
    if(test==='corrupt'){
      try{await updater.downloadUpdate();}catch(error){checksumRejected=/checksum|sha512/i.test(String(error));}
      assert(checksumRejected,'Mismatched SHA-512 must reject the installer');corrupt=false;
    }else{
      const files=await updater.downloadUpdate();
      const digest=crypto.createHash('sha512').update(await fsp.readFile(files[0])).digest('base64');
      assert.equal(digest,manifest.files[0].sha512);
      updater.doInstall=options=>{installOptions=options;return true;};
      updater.quitAndInstall(true,true);
      await new Promise(resolve=>setImmediate(resolve));
      assert.equal(installOptions.isSilent,true);assert.equal(installOptions.isForceRunAfter,true);assert(quitRequested);
    }
  }
  await new Promise(resolve=>server.close(resolve));
  await fsp.writeFile(path.join(output,'report.json'),JSON.stringify({passed:true,checksumRejected,requests,realInstallerDownloaded:true,installHandoff:installOptions,quitRequested,installerExecutionSuppressed:true},null,2));app.exit(0);
}).catch(async error=>{await fsp.mkdir(output,{recursive:true});await fsp.writeFile(path.join(output,'error.txt'),String(error.stack||error));app.exit(1);});
