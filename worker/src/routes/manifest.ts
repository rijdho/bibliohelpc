import { Hono } from 'hono';
import type { Env } from '../bindings.js';

export const manifest = new Hono<{ Bindings: Env }>();

const MANIFEST_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp
  xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0"
  xmlns:ov="http://schemas.microsoft.com/office/taskpaneappversionoverrides"
  xsi:type="TaskPaneApp">

  <Id>c1b10h3lp-c10d-4dd1-n000-b1bl10h3lpc1</Id>
  <Version>1.1.0</Version>
  <ProviderName>__APP_NAME__</ProviderName>
  <DefaultLocale>es-ES</DefaultLocale>
  <DisplayName DefaultValue="__APP_NAME__" />
  <Description DefaultValue="Verifica referencias bibliograficas academicas directamente desde Word. Busca en CrossRef, OpenAlex, Open Library, ISBNdb e Internet Archive." />
  <SupportUrl DefaultValue="https://__DOMAIN__" />
  <IconUrl DefaultValue="https://__DOMAIN__/icons/icon-32.png" />
  <HighResolutionIconUrl DefaultValue="https://__DOMAIN__/icons/icon-80.png" />

  <AppDomains>
    <AppDomain>https://__DOMAIN__</AppDomain>
  </AppDomains>

  <Hosts>
    <Host Name="Document" />
  </Hosts>

  <Requirements>
    <Sets>
      <Set Name="DocumentApi" MinVersion="1.1" />
    </Sets>
  </Requirements>

  <DefaultSettings>
    <SourceLocation DefaultValue="https://__DOMAIN__/taskpane" />
  </DefaultSettings>

  <Permissions>ReadWriteDocument</Permissions>

  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="VersionOverridesV1_0">
    <Hosts>
      <Host xsi:type="Document">
        <DesktopFormFactor>
          <GetStarted>
            <Title resid="GetStarted.Title" />
            <Description resid="GetStarted.Description" />
            <LearnMoreUrl resid="GetStarted.LearnMoreUrl" />
          </GetStarted>
          <ExtensionPoint xsi:type="PrimaryCommandSurface">
            <OfficeTab id="TabHome">
              <Group id="BiblioHelpCGroup">
                <Label resid="GroupLabel" />
                <Icon>
                  <bt:Image size="16" resid="Icon.16x16" />
                  <bt:Image size="32" resid="Icon.32x32" />
                  <bt:Image size="80" resid="Icon.80x80" />
                </Icon>
                <Control xsi:type="Button" id="BiblioHelpCButton">
                  <Label resid="TaskpaneButton.Label" />
                  <Supertip>
                    <Title resid="TaskpaneButton.Label" />
                    <Description resid="TaskpaneButton.Tooltip" />
                  </Supertip>
                  <Icon>
                    <bt:Image size="16" resid="Icon.16x16" />
                    <bt:Image size="32" resid="Icon.32x32" />
                    <bt:Image size="80" resid="Icon.80x80" />
                  </Icon>
                  <Action xsi:type="ShowTaskpane">
                    <TaskpaneId>BiblioHelpCPane</TaskpaneId>
                    <SourceLocation resid="Taskpane.Url" />
                  </Action>
                </Control>
              </Group>
            </OfficeTab>
          </ExtensionPoint>
        </DesktopFormFactor>
      </Host>
    </Hosts>

    <Resources>
      <bt:Images>
        <bt:Image id="Icon.16x16" DefaultValue="https://__DOMAIN__/icons/icon-16.png" />
        <bt:Image id="Icon.32x32" DefaultValue="https://__DOMAIN__/icons/icon-32.png" />
        <bt:Image id="Icon.80x80" DefaultValue="https://__DOMAIN__/icons/icon-80.png" />
      </bt:Images>
      <bt:Urls>
        <bt:Url id="Taskpane.Url" DefaultValue="https://__DOMAIN__/taskpane" />
        <bt:Url id="GetStarted.LearnMoreUrl" DefaultValue="https://__DOMAIN__" />
      </bt:Urls>
      <bt:ShortStrings>
        <bt:String id="GetStarted.Title" DefaultValue="__APP_NAME__" />
        <bt:String id="GroupLabel" DefaultValue="__APP_NAME__" />
        <bt:String id="TaskpaneButton.Label" DefaultValue="Verificar referencias" />
      </bt:ShortStrings>
      <bt:LongStrings>
        <bt:String id="GetStarted.Description" DefaultValue="Selecciona tus referencias y verificalas contra bases de datos academicas." />
        <bt:String id="TaskpaneButton.Tooltip" DefaultValue="Abre el panel de __APP_NAME__ para verificar referencias bibliograficas." />
      </bt:LongStrings>
    </Resources>
  </VersionOverrides>
</OfficeApp>`;

manifest.get('/manifest', (c) => {
  const domain = c.env.APP_DOMAIN || 'bibliohelp.rijdho.org';
  const appName = c.env.APP_NAME || 'BiblioHelp';

  let xml = MANIFEST_TEMPLATE
    .replaceAll('__DOMAIN__', domain)
    .replaceAll('__APP_NAME__', appName);

  const filename = `${appName.toLowerCase().replace(/\s+/g, '-')}-manifest.xml`;

  return c.body(xml, 200, {
    'Content-Type': 'application/xml',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
});
